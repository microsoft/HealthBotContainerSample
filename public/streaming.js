/*
 * Streaming UI controller for the Health Bot container sample.
 *
 * HealthBot forwards every Orchestrator AG-UI event to the browser as a durable
 * Direct Line message envelope:
 *
 *   { type: "message", value: { stream: { streamId, event: { type, ... } } } }
 *
 * The browser — not HealthBot — interprets that envelope and turns it into a single
 * temporary Web Chat bubble that grows as progress and answer text arrive, then is
 * replaced by the authoritative final bot activity.
 *
 * This module owns all streaming state and animation. index.js wires it into the
 * Web Chat store middleware. Everything here is framework-free so it can be unit
 * tested in a plain Node VM.
 *
 * Note: TOOL_CALL_CHUNK is intentionally NOT rendered. answerDelta() is the single
 * answer-interpretation point where that support can be added later, together with a
 * separately designed reconciliation policy, without touching transport detection,
 * typing ownership, or final replacement.
 */
(function (global) {
    'use strict';

    var incomingActivityActionType = 'DIRECT_LINE/INCOMING_ACTIVITY';
    var activityMessageType = 'message';

    var AGUI_EVENT = {
        RUN_ERROR: 'RUN_ERROR',
        RUN_STARTED: 'RUN_STARTED',
        TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
        TOOL_CALL_START: 'TOOL_CALL_START',
        CUSTOM: 'CUSTOM'
    };

    var REVEAL_MS = 18;
    var ANSWER_REVEAL_MS = 12;
    var STREAM_TYPING_REFRESH_MS = 1000;
    var MAX_STREAM_TYPING_DURATION_MS = 5 * 60 * 1000;

    // Map a supported event to safe, user-visible progress text. Never exposes a raw
    // tool name, tool arguments, custom payloads, or unknown extension values.
    function streamProgressText(event) {
        if (event.type === AGUI_EVENT.RUN_STARTED) {
            return 'Evaluating your request';
        }
        if (event.type === AGUI_EVENT.TOOL_CALL_START
            && typeof (event.extensions && event.extensions.toolProgress) === 'string') {
            return event.extensions.toolProgress;
        }
        return '';
    }

    // Single answer-delta interpretation point. Currently only TEXT_MESSAGE_CONTENT
    // contributes to the answer. This is the stable extension point for a future
    // TOOL_CALL_CHUNK design; keep transport/typing/replacement decoupled from it.
    function answerDelta(event) {
        if (event.type === AGUI_EVENT.TEXT_MESSAGE_CONTENT && event.delta) {
            return event.delta;
        }
        return '';
    }

    function createController() {
        // Turn and identity state
        var streamTurn = 0;
        var streamProgressId = null;
        var streamId = null;

        // Lifecycle state
        var streamAwaitingFinal = false;
        var streamAnswerStarted = false;
        var lastProgressText = '';

        // Content and animation state
        var answerBuffer = '';
        var activeReveal = null;
        var pendingProgress = null;
        var answerTarget = '';
        var answerShown = 0;
        var answerLoop = null;

        // Typing state
        var streamTypingActive = false;
        var streamTypingLoop = null;
        var streamTypingStartedAt = null;
        var streamTypingFrom = null;
        var lastBotTypingActivity = null;

        function cancelAnswerReveal() {
            if (answerLoop) {
                clearTimeout(answerLoop);
                answerLoop = null;
            }
            answerTarget = '';
            answerShown = 0;
        }

        function cancelReveal() {
            if (activeReveal) {
                activeReveal.cancelled = true;
                activeReveal.timers.forEach(clearTimeout);
                activeReveal = null;
            }
            pendingProgress = null;
            cancelAnswerReveal();
        }

        function dispatchStreamTyping(store) {
            if (!streamTypingActive) {
                return;
            }

            var typingActivity = lastBotTypingActivity || {};
            store.dispatch({
                type: incomingActivityActionType,
                payload: {
                    activity: Object.assign({}, typingActivity, {
                        id: (streamProgressId || 'has-stream-progress-0') + '-typing',
                        type: 'typing',
                        from: typingActivity.from
                            || streamTypingFrom
                            || { role: 'bot', id: 'has-stream', name: 'Bot' },
                        timestamp: new Date().toISOString(),
                        channelData: Object.assign({}, typingActivity.channelData || {}, {
                            hasStreamTyping: true
                        })
                    })
                }
            });
        }

        function scheduleStreamTyping(store) {
            if (streamTypingLoop || !streamTypingActive) {
                return;
            }

            streamTypingLoop = setTimeout(function () {
                streamTypingLoop = null;
                if (!streamTypingActive) {
                    return;
                }
                if (streamTypingStartedAt !== null
                    && Date.now() - streamTypingStartedAt >= MAX_STREAM_TYPING_DURATION_MS) {
                    stopStreamTyping();
                    return;
                }
                dispatchStreamTyping(store);
                scheduleStreamTyping(store);
            }, STREAM_TYPING_REFRESH_MS);
        }

        function startStreamTyping(store, from) {
            if (from && from.role === 'bot') {
                streamTypingFrom = from;
            }
            if (streamTypingStartedAt === null) {
                streamTypingStartedAt = Date.now();
            }
            if (Date.now() - streamTypingStartedAt >= MAX_STREAM_TYPING_DURATION_MS) {
                stopStreamTyping();
                return;
            }
            if (streamTypingActive) {
                return;
            }
            streamTypingActive = true;
            dispatchStreamTyping(store);
            scheduleStreamTyping(store);
        }

        function stopStreamTyping() {
            streamTypingActive = false;
            if (streamTypingLoop) {
                clearTimeout(streamTypingLoop);
                streamTypingLoop = null;
            }
            streamTypingFrom = null;
        }

        function resetStreamTyping() {
            stopStreamTyping();
            streamTypingStartedAt = null;
        }

        function startNextProgressReveal(store, activityId) {
            if (activeReveal || answerLoop) {
                return;
            }

            var text = pendingProgress;
            pendingProgress = null;
            if (!text) {
                if (answerTarget.length > answerShown) {
                    stepAnswer(store, activityId);
                }
                return;
            }

            var state = { cancelled: false, timers: [] };
            activeReveal = state;
            var step = function (i) {
                if (state.cancelled) return;
                store.dispatch({
                    type: incomingActivityActionType,
                    payload: {
                        activity: {
                            id: activityId,
                            type: activityMessageType,
                            text: text.slice(0, i),
                            from: { role: 'bot', id: 'has-stream', name: 'Bot' },
                            timestamp: new Date().toISOString(),
                            channelData: { hasStreamReveal: true }
                        }
                    }
                });
                if (i < text.length) {
                    state.timers.push(setTimeout(function () { step(i + 1); }, REVEAL_MS));
                } else {
                    activeReveal = null;
                    startNextProgressReveal(store, activityId);
                }
            };
            step(1);
        }

        function revealProgress(store, activityId, target) {
            if (!target) {
                return;
            }
            pendingProgress = target;
            startNextProgressReveal(store, activityId);
        }

        function showAnswer(store, activityId, text) {
            var full = text || '';
            if (full.length <= answerTarget.length) {
                return;
            }
            answerTarget = full;
            if (!activeReveal && !pendingProgress && !answerLoop) {
                stepAnswer(store, activityId);
            }
        }

        function stepAnswer(store, activityId) {
            answerLoop = null;
            var backlog = answerTarget.length - answerShown;
            if (backlog > 0) {
                var chunk = Math.max(1, Math.ceil(backlog / 8));
                answerShown += chunk;
                store.dispatch({
                    type: incomingActivityActionType,
                    payload: {
                        activity: {
                            id: activityId,
                            type: activityMessageType,
                            text: answerTarget.slice(0, answerShown),
                            from: { role: 'bot', id: 'has-stream', name: 'Bot' },
                            timestamp: new Date().toISOString(),
                            channelData: { hasStreamReveal: true }
                        }
                    }
                });
                if (answerShown < answerTarget.length) {
                    answerLoop = setTimeout(function () { stepAnswer(store, activityId); }, ANSWER_REVEAL_MS);
                }
            }
        }

        // Reset all stream state for a new outgoing turn.
        function resetForNewTurn() {
            resetStreamTyping();
            lastBotTypingActivity = null;
            cancelReveal();
            streamTurn += 1;
            streamProgressId = 'has-stream-progress-' + streamTurn;
            streamId = null;
            streamAwaitingFinal = false;
            streamAnswerStarted = false;
            lastProgressText = '';
            answerBuffer = '';
        }

        // Interpret one incoming Direct Line activity and tell the middleware what to do:
        //   'passthrough'   - a synthetic reveal/typing frame we created; forward as-is
        //   'swallow'       - suppressed typing or a raw stream envelope; do NOT forward
        //   'forward-final' - authoritative final bot activity; id reconciled, forward then
        //                     call stopTypingAfterFinal()
        //   'forward'       - nothing streaming-related; middleware forwards normally
        function handleIncoming(store, incoming) {
            if (incoming && incoming.channelData
                && (incoming.channelData.hasStreamReveal || incoming.channelData.hasStreamTyping)) {
                return 'passthrough';
            }

            if (incoming && incoming.type === 'typing' && incoming.from && incoming.from.role === 'bot') {
                lastBotTypingActivity = incoming;
            }
            if (incoming && incoming.type === 'typing' && (streamAwaitingFinal || streamTypingActive)) {
                return 'swallow';
            }

            var stream = (incoming && incoming.type === activityMessageType && incoming.value)
                ? incoming.value.stream
                : null;
            if (stream && stream.event) {
                if (stream.streamId && stream.streamId !== streamId) {
                    streamId = stream.streamId;
                    answerBuffer = '';
                }

                var ev = stream.event;
                if (!streamProgressId) {
                    streamProgressId = 'has-stream-progress-0';
                }
                if (ev.type === AGUI_EVENT.RUN_ERROR) {
                    cancelReveal();
                    resetStreamTyping();
                    // Keep streamProgressId and stay awaiting so the bot's error message
                    // replaces the progress bubble instead of rendering beside it. Reset
                    // on the next outgoing user activity.
                    streamAwaitingFinal = true;
                    return 'swallow';
                }
                if (ev.type === AGUI_EVENT.RUN_STARTED) {
                    resetStreamTyping();
                }
                startStreamTyping(store, incoming.from);
                streamAwaitingFinal = true;

                var delta = answerDelta(ev);
                if (delta) {
                    if (!streamAnswerStarted) {
                        streamAnswerStarted = true;
                    }
                    streamAwaitingFinal = true;
                    answerBuffer += delta;
                    showAnswer(store, streamProgressId, answerBuffer);
                } else if (!streamAnswerStarted) {
                    var text = streamProgressText(ev);
                    if (text && text !== lastProgressText) {
                        lastProgressText = text;
                        streamAwaitingFinal = true;
                        revealProgress(store, streamProgressId, text);
                    }
                }
                return 'swallow';
            }

            if (streamAwaitingFinal
                && incoming && incoming.from && incoming.from.role === 'bot'
                && incoming.type === activityMessageType) {
                cancelReveal();
                incoming.id = streamProgressId;
                streamAwaitingFinal = false;
                return 'forward-final';
            }

            return 'forward';
        }

        // Called by the middleware after forwarding the final activity so synthetic
        // typing stops and the authoritative activity takes over cleanly.
        function stopTypingAfterFinal() {
            resetStreamTyping();
        }

        return {
            resetForNewTurn: resetForNewTurn,
            handleIncoming: handleIncoming,
            stopTypingAfterFinal: stopTypingAfterFinal
        };
    }

    global.HealthBotStreaming = {
        createController: createController,
        streamProgressText: streamProgressText,
        answerDelta: answerDelta,
        AGUI_EVENT: AGUI_EVENT
    };
})(typeof window !== 'undefined' ? window : globalThis);
