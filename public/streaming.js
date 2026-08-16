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
 * Web Chat store middleware. Everything here is framework-free (modern JS, no bundler
 * or DOM dependency) so it can be unit tested in a plain Node VM.
 *
 * Note: TOOL_CALL_CHUNK is intentionally NOT rendered. answerDelta() is the single
 * answer-interpretation point where that support can be added later, together with a
 * separately designed reconciliation policy, without touching transport detection,
 * typing ownership, or final replacement.
 */
(function (global) {
    'use strict';

    const incomingActivityActionType = 'DIRECT_LINE/INCOMING_ACTIVITY';
    const activityMessageType = 'message';

    const AGUI_EVENT = {
        RUN_ERROR: 'RUN_ERROR',
        RUN_STARTED: 'RUN_STARTED',
        TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
        TOOL_CALL_START: 'TOOL_CALL_START'
    };

    const REVEAL_MS = 18;
    const ANSWER_REVEAL_MS = 12;
    const STREAM_TYPING_REFRESH_MS = 1000;
    const MAX_STREAM_TYPING_DURATION_MS = 5 * 60 * 1000;
    // A temporary progress/answer bubble is only ever a placeholder for the
    // authoritative final activity. If that final activity never arrives, the bubble
    // must not linger on screen forever, so it is retired after this window of
    // inactivity. The window is refreshed every time new progress or answer content
    // arrives, and cleared once the final activity replaces the bubble.
    const MAX_PROGRESS_LINE_VISIBLE_MS = 5 * 60 * 1000;

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
        let streamTurn = 0;
        let streamProgressId = null;
        let streamId = null;

        // Lifecycle state
        let streamAwaitingFinal = false;
        let streamAnswerStarted = false;
        let lastProgressText = '';

        // Content and animation state
        let answerBuffer = '';
        let activeReveal = null;
        let pendingProgress = null;
        let answerTarget = '';
        let answerShown = 0;
        let answerLoop = null;

        // Typing state
        let streamTypingActive = false;
        let streamTypingLoop = null;
        let streamTypingStartedAt = null;
        let streamTypingFrom = null;
        let lastBotTypingActivity = null;

        // Bubble-expiry state
        let progressExpiryLoop = null;

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

            const typingActivity = lastBotTypingActivity || {};
            store.dispatch({
                type: incomingActivityActionType,
                payload: {
                    activity: {
                        ...typingActivity,
                        id: (streamProgressId || 'has-stream-progress-0') + '-typing',
                        type: 'typing',
                        from: typingActivity.from
                            || streamTypingFrom
                            || { role: 'bot', id: 'has-stream', name: 'Bot' },
                        timestamp: new Date().toISOString(),
                        channelData: {
                            ...(typingActivity.channelData || {}),
                            hasStreamTyping: true
                        }
                    }
                }
            });
        }

        function scheduleStreamTyping(store) {
            if (streamTypingLoop || !streamTypingActive) {
                return;
            }

            streamTypingLoop = setTimeout(() => {
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

        // Retire the temporary bubble once it has been visible for too long without
        // being replaced by the authoritative final activity. Clears the placeholder
        // text and tears down all streaming animation/typing for the turn so nothing
        // lingers on screen; a late final activity is then handled as an ordinary
        // bot message.
        function expireProgressBubble(store) {
            cancelReveal();
            resetStreamTyping();
            store.dispatch({
                type: incomingActivityActionType,
                payload: {
                    activity: {
                        id: streamProgressId || 'has-stream-progress-0',
                        type: activityMessageType,
                        text: '',
                        from: { role: 'bot', id: 'has-stream', name: 'Bot' },
                        timestamp: new Date().toISOString(),
                        channelData: { hasStreamReveal: true, hasStreamExpired: true }
                    }
                }
            });
            streamAwaitingFinal = false;
            streamAnswerStarted = false;
            lastProgressText = '';
            answerBuffer = '';
        }

        function clearProgressExpiry() {
            if (progressExpiryLoop) {
                clearTimeout(progressExpiryLoop);
                progressExpiryLoop = null;
            }
        }

        // Refresh the inactivity window guarding the temporary bubble. Called on every
        // new progress/answer frame so an actively growing bubble is never retired.
        function armProgressExpiry(store) {
            clearProgressExpiry();
            progressExpiryLoop = setTimeout(() => {
                progressExpiryLoop = null;
                expireProgressBubble(store);
            }, MAX_PROGRESS_LINE_VISIBLE_MS);
        }

        function startNextProgressReveal(store, activityId) {
            if (activeReveal || answerLoop) {
                return;
            }

            const text = pendingProgress;
            pendingProgress = null;
            if (!text) {
                if (answerTarget.length > answerShown) {
                    stepAnswer(store, activityId);
                }
                return;
            }

            const state = { cancelled: false, timers: [] };
            activeReveal = state;
            const step = (i) => {
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
                    state.timers.push(setTimeout(() => step(i + 1), REVEAL_MS));
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
            const full = text || '';
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
            const backlog = answerTarget.length - answerShown;
            if (backlog > 0) {
                const chunk = Math.max(1, Math.ceil(backlog / 8));
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
                    answerLoop = setTimeout(() => stepAnswer(store, activityId), ANSWER_REVEAL_MS);
                }
            }
        }

        // Reset all stream state for a new outgoing turn. If the previous turn's
        // temporary bubble is still awaiting its final activity (e.g. the user sent a
        // new message mid-stream), retire it first so it can't be orphaned on screen.
        function resetForNewTurn(store) {
            if (streamAwaitingFinal && store) {
                expireProgressBubble(store);
            }
            resetStreamTyping();
            clearProgressExpiry();
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

            const stream = (incoming && incoming.type === activityMessageType && incoming.value)
                ? incoming.value.stream
                : null;
            if (stream && stream.event) {
                if (stream.streamId && stream.streamId !== streamId) {
                    streamId = stream.streamId;
                    answerBuffer = '';
                    // A fresh stream restarts answer accumulation; drop any reveal state
                    // from the previous stream so a shorter new answer isn't swallowed.
                    cancelAnswerReveal();
                }

                const ev = stream.event;
                if (!streamProgressId) {
                    streamProgressId = 'has-stream-progress-0';
                }
                if (ev.type === AGUI_EVENT.RUN_ERROR) {
                    cancelReveal();
                    resetStreamTyping();
                    // Keep streamProgressId and stay awaiting so the bot's error message
                    // replaces the progress bubble instead of rendering beside it. Reset
                    // on the next outgoing user activity. Guard the placeholder with the
                    // inactivity window in case that error message never arrives.
                    streamAwaitingFinal = true;
                    armProgressExpiry(store);
                    return 'swallow';
                }
                if (ev.type === AGUI_EVENT.RUN_STARTED) {
                    resetStreamTyping();
                }
                startStreamTyping(store, incoming.from);
                streamAwaitingFinal = true;

                const delta = answerDelta(ev);
                if (delta) {
                    if (!streamAnswerStarted) {
                        streamAnswerStarted = true;
                    }
                    streamAwaitingFinal = true;
                    answerBuffer += delta;
                    showAnswer(store, streamProgressId, answerBuffer);
                    armProgressExpiry(store);
                } else if (!streamAnswerStarted) {
                    const text = streamProgressText(ev);
                    if (text && text !== lastProgressText) {
                        lastProgressText = text;
                        streamAwaitingFinal = true;
                        revealProgress(store, streamProgressId, text);
                        armProgressExpiry(store);
                    }
                }
                return 'swallow';
            }

            if (streamAwaitingFinal
                && incoming && incoming.from && incoming.from.role === 'bot'
                && incoming.type === activityMessageType) {
                cancelReveal();
                clearProgressExpiry();
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
            clearProgressExpiry();
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
