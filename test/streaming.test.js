'use strict';

// Deterministic tests for the streaming UI controller (public/streaming.js).
//
// The controller owns all stream state/animation; index.js wires it into the Web Chat
// store middleware. This harness loads streaming.js in a VM and drives it through a
// middleware that mirrors the streaming-relevant glue in index.js:
//   - DIRECT_LINE/POST_ACTIVITY (message|invoke) -> controller.resetForNewTurn()
//   - DIRECT_LINE/INCOMING_ACTIVITY -> controller.handleIncoming(store, activity),
//       'passthrough' forwards, 'swallow' drops, 'forward'/'forward-final' forward
//       (final also calls stopTypingAfterFinal()).
// A fake timer queue advances reveal/typing loops like a real event loop (callbacks run
// on flush() in due-time order, not recursively at schedule time), and a mutable clock
// advances as timers are drained, which drives the typing and bubble-expiry hard caps.
// flush() with no budget drains to quiescence and throws if any timer leaks.

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createContext, runInContext } = require('node:vm');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const streamingScript = readFileSync(
    resolve(__dirname, '..', 'public', 'streaming.js'),
    'utf8'
);

function createHarness() {
    const forwarded = [];

    // Fake timer queue. Each scheduled callback is recorded with its due time and run
    // on flush(), not at schedule time. flush() drains in due-time order while advancing
    // a virtual clock, mirroring how a real event loop retires timers.
    let timerId = 0;
    let now = 1700000000000;
    const timers = new Map();

    // Run up to `maxCallbacks` scheduled callbacks in due-time order, advancing the
    // clock to each callback's due time (never backwards).
    const runDueTimers = (maxCallbacks) => {
        let count = 0;
        while (timers.size && count < maxCallbacks) {
            let dueId = null;
            let dueTimer = null;
            for (const [id, timer] of timers) {
                if (dueTimer === null || timer.due < dueTimer.due) {
                    dueTimer = timer;
                    dueId = id;
                }
            }
            timers.delete(dueId);
            if (dueTimer.due > now) {
                now = dueTimer.due;
            }
            count += 1;
            dueTimer.fn();
        }
        return count;
    };

    // Drain-by-due-time. With no argument, run the queue to quiescence and throw if any
    // timer is still pending, so a leaked or never-terminating loop fails loudly instead
    // of being silently capped. The self-terminating loops here (typing heartbeat, bubble
    // expiry) settle once the virtual clock passes their hard caps. With an explicit
    // budget, step that many callbacks for partial-animation assertions.
    const SETTLE_BUDGET = 100000;
    const flush = (maxCallbacks) => {
        if (maxCallbacks === undefined) {
            runDueTimers(SETTLE_BUDGET);
            if (timers.size > 0) {
                throw new Error(`flush() did not settle: ${timers.size} timer(s) still pending`);
            }
            return;
        }
        runDueTimers(maxCallbacks);
    };

    // Run only the tightly-spaced reveal/answer animation timers: keep going while the
    // next due timer falls within one reveal cadence, so the second-scale typing
    // heartbeat and the minutes-scale bubble-expiry guard are left pending. Lets a test
    // assert the fully revealed text without draining into either hard cap.
    const REVEAL_LOOKAHEAD_MS = 500;
    const flushReveals = () => {
        while (timers.size) {
            let dueId = null;
            let dueTimer = null;
            for (const [id, timer] of timers) {
                if (dueTimer === null || timer.due < dueTimer.due) {
                    dueTimer = timer;
                    dueId = id;
                }
            }
            if (dueTimer.due > now + REVEAL_LOOKAHEAD_MS) {
                break;
            }
            timers.delete(dueId);
            if (dueTimer.due > now) {
                now = dueTimer.due;
            }
            dueTimer.fn();
        }
    };

    const context = createContext({
        window: {},
        setTimeout: (fn, delay = 0) => {
            const id = ++timerId;
            timers.set(id, { due: now + delay, fn });
            return id;
        },
        clearTimeout: (id) => {
            timers.delete(id);
        },
        Date: class extends Date {
            constructor(value) {
                super(value === undefined ? now : value);
            }
            static now() {
                return now;
            }
        },
        Object,
        Math,
        console,
    });

    runInContext(streamingScript, context);
    const streaming = context.window.HealthBotStreaming.createController();

    // Middleware mirroring the streaming glue in public/index.js.
    let dispatch;
    const store = { dispatch: (action) => dispatch(action) };
    dispatch = (action) => {
        if (action.type === 'DIRECT_LINE/POST_ACTIVITY') {
            const outgoing = action.payload && action.payload.activity;
            if (outgoing && (outgoing.type === 'message' || outgoing.type === 'invoke')) {
                streaming.resetForNewTurn();
            }
        }
        if (action.type === 'DIRECT_LINE/INCOMING_ACTIVITY') {
            const directive = streaming.handleIncoming(store, action.payload.activity);
            if (directive === 'passthrough') {
                forwarded.push(action);
                return action;
            }
            if (directive === 'swallow') {
                return undefined;
            }
            forwarded.push(action);
            if (directive === 'forward-final') {
                streaming.stopTypingAfterFinal();
            }
            return action;
        }
        forwarded.push(action);
        return action;
    };

    const incoming = (activity) => {
        const action = { type: 'DIRECT_LINE/INCOMING_ACTIVITY', payload: { activity } };
        dispatch(action);
        return action;
    };

    const streamEvent = (event, streamId = 'run_1') =>
        incoming({
            type: 'message',
            from: { role: 'bot' },
            value: { stream: { streamId, event } },
        });

    const streamDelta = (delta, streamId = 'run_1') =>
        streamEvent({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg_1', delta }, streamId);

    const sendUserMessage = () =>
        dispatch({
            type: 'DIRECT_LINE/POST_ACTIVITY',
            payload: { activity: { type: 'message', text: 'Next turn' } },
        });

    const typingFrames = () =>
        forwarded.filter((a) => a.payload.activity.channelData && a.payload.activity.channelData.hasStreamTyping);
    const revealFrames = () =>
        forwarded.filter((a) => a.payload.activity.channelData && a.payload.activity.channelData.hasStreamReveal);

    return {
        forwarded,
        incoming,
        streamEvent,
        streamDelta,
        sendUserMessage,
        flush,
        flushReveals,
        advanceTime: (ms) => {
            now += ms;
        },
        typingFrames,
        revealFrames,
    };
}

describe('streaming typing indicator', () => {
    it('passes typing before a stream starts', () => {
        const { forwarded, incoming } = createHarness();
        const typing = incoming({ type: 'typing' });
        assert.ok(forwarded.includes(typing));
    });

    it('suppresses typing while a stream is active', () => {
        const { forwarded, incoming, streamDelta } = createHarness();
        streamDelta('Thinking');
        const typing = incoming({ type: 'typing' });
        assert.ok(!forwarded.includes(typing));
    });

    it('resumes typing after the final bot activity', () => {
        const { forwarded, incoming, streamDelta } = createHarness();
        streamDelta('Answer');
        incoming({ type: 'message', text: 'Done', from: { role: 'bot' } });
        const typing = incoming({ type: 'typing' });
        assert.ok(forwarded.includes(typing));
    });

    it('resumes typing when a new outgoing turn resets stream state', () => {
        const { forwarded, incoming, streamDelta, sendUserMessage, flush, typingFrames } = createHarness();
        streamDelta('Answer');
        flush(4);
        const typingCount = typingFrames().length;
        sendUserMessage();
        flush(8);
        const typing = incoming({ type: 'typing', from: { role: 'bot', id: 'real-bot' } });
        assert.ok(forwarded.includes(typing));
        assert.equal(typingFrames().length, typingCount);
    });

    it('keeps the native typing row styled and refreshed alongside streamed frames', () => {
        const { incoming, streamEvent, flush, typingFrames, revealFrames } = createHarness();
        incoming({ type: 'typing', from: { role: 'bot', id: 'real-bot' }, channelData: { typingStyle: 'grey' } });
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        flush(60);

        assert.ok(revealFrames().length > 0);

        const streamTyping = typingFrames();
        // The heartbeat keeps refreshing the native typing row while the stream runs.
        assert.ok(streamTyping.length > 1);
        assert.ok(streamTyping.every((a) =>
            a.payload.activity.type === 'typing' &&
            a.payload.activity.text === undefined &&
            a.payload.activity.from.id === 'real-bot' &&
            a.payload.activity.channelData.typingStyle === 'grey'
        ));
        assert.equal(new Set(streamTyping.map((a) => a.payload.activity.id)).size, 1);
    });

    it('stops refreshing native typing when the streamed run errors', () => {
        const { streamEvent, flush, typingFrames } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        flush(8);
        streamEvent({ type: 'RUN_ERROR', runId: 'run_1', value: 'INTERNAL_SERVER_ERROR' });
        const typingAtError = typingFrames().length;
        flush(100);
        assert.equal(typingFrames().length, typingAtError);
    });

    it('stops refreshing native typing after the hard limit without a final activity', () => {
        const { streamEvent, flush, advanceTime, typingFrames } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        const typingBeforeTimeout = typingFrames().length;
        advanceTime(5 * 60 * 1000);
        flush();
        assert.equal(typingFrames().length, typingBeforeTimeout);
    });
});

describe('streamed answer', () => {
    it('swallows the raw stream envelope and emits a local reveal frame', () => {
        const { forwarded, streamDelta, revealFrames } = createHarness();
        const frame = streamDelta('Hello world');
        assert.ok(!forwarded.includes(frame));
        const frames = revealFrames();
        assert.ok(frames.length > 0);
        const revealed = frames[0].payload.activity.text || '';
        assert.ok(revealed.length > 0);
        assert.ok('Hello world'.startsWith(revealed));
    });

    it('accumulates deltas across frames into the growing answer', () => {
        const { streamDelta, flushReveals, revealFrames } = createHarness();
        streamDelta('Hello ');
        flushReveals();
        streamDelta('world');
        flushReveals();
        const frames = revealFrames();
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Hello world');
    });

    it('reveals frames under the single streaming bubble id', () => {
        const { streamDelta, revealFrames } = createHarness();
        streamDelta('Answer text');
        assert.equal(revealFrames()[0].payload.activity.id, 'has-stream-progress-0');
    });

    it('clears the previous answer buffer when the streamId changes', () => {
        const { streamDelta, flushReveals, revealFrames } = createHarness();
        streamDelta('AAA', 'run_1');
        flushReveals();
        streamDelta('BBBBBBBBBB', 'run_2');
        flushReveals();
        const frames = revealFrames();
        const last = frames[frames.length - 1].payload.activity.text;
        // The new stream must not concatenate onto the previous buffer.
        assert.equal(last, 'BBBBBBBBBB');
        assert.ok(!last.includes('AAA'));
    });

    it('keeps native typing until the final adaptive card takes over', () => {
        const { forwarded, incoming, streamEvent, streamDelta, flush, revealFrames, typingFrames } = createHarness();
        streamDelta('Streaming answer');
        flush(30);
        streamEvent({ type: 'TEXT_MESSAGE_END', messageId: 'msg_1' });
        streamEvent({ type: 'RUN_FINISHED', runId: 'run_1' });
        flush(4);

        const frames = revealFrames();
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Streaming answer');
        assert.ok(typingFrames().length > 1);

        const finalCard = incoming({
            type: 'message',
            text: 'Streaming answer',
            from: { role: 'bot' },
            attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {} }],
        });
        const typingCountAfterCard = typingFrames().length;
        flush(8);

        assert.ok(forwarded.includes(finalCard));
        assert.equal(finalCard.payload.activity.id, 'has-stream-progress-0');
        assert.equal(finalCard.payload.activity.text, 'Streaming answer');
        assert.deepEqual(finalCard.payload.activity.attachments, [
            { contentType: 'application/vnd.microsoft.card.adaptive', content: {} },
        ]);
        assert.equal(typingFrames().length, typingCountAfterCard);
    });

    it('forwards the final ordinary bot message exactly once', () => {
        const { forwarded, incoming, streamDelta, flush } = createHarness();
        streamDelta('Answer');
        flush(20);
        const finalCard = incoming({ type: 'message', text: 'Answer', from: { role: 'bot' } });
        flush(8);
        assert.equal(forwarded.filter((a) => a === finalCard).length, 1);
    });

    it('does not let pending reveal timers overwrite the final activity', () => {
        const { forwarded, incoming, streamDelta, flush } = createHarness();
        streamDelta('A long streamed answer that is still animating');
        const finalCard = incoming({
            type: 'message',
            text: 'A long streamed answer that is still animating',
            from: { role: 'bot' },
        });
        const finalIndex = forwarded.indexOf(finalCard);
        flush(200);
        const laterReveal = forwarded
            .slice(finalIndex + 1)
            .some((a) => a.payload.activity.channelData && a.payload.activity.channelData.hasStreamReveal);
        assert.ok(!laterReveal);
    });
});

describe('streamed progress (pre-answer events)', () => {
    it("does not render a tool call's raw tool name", () => {
        const { forwarded, streamEvent, flush, revealFrames } = createHarness();
        const frame = streamEvent({ type: 'TOOL_CALL_START', toolCallName: 'generate_answer' });
        flush();
        assert.ok(!forwarded.includes(frame));
        assert.equal(revealFrames().length, 0);
    });

    it('renders the tool progress intent', () => {
        const { streamEvent, flushReveals, revealFrames } = createHarness();
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'generate_answer',
            extensions: { toolProgress: 'Drafting a prior authorization note' },
        });
        flushReveals();
        const frames = revealFrames();
        assert.ok(frames.length > 0);
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Drafting a prior authorization note');
    });

    it('renders run start as evaluating the request', () => {
        const { streamEvent, flushReveals, revealFrames } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        flushReveals();
        const frames = revealFrames();
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Evaluating your request');
    });

    it('finishes each progress message before revealing the next stream', () => {
        const { streamEvent, streamDelta, flushReveals, revealFrames } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'medical_knowledge-run',
            extensions: { toolProgress: 'Searching medical information' },
        });
        streamDelta('Final answer');
        flushReveals();

        const revealedTexts = revealFrames().map((a) => a.payload.activity.text);
        // Find the first animation frame that is a non-empty, still-incomplete prefix
        // of the eventual full line. This asserts ordering without hard-coding the
        // reveal chunk math (a fixed 'S' / 'Fi' frame silently passes as -1 if the
        // chunking ever changes).
        const firstPrefixIndex = (texts, full) =>
            texts.findIndex((t) => t.length > 0 && t.length < full.length && full.startsWith(t));
        const runStartEnd = revealedTexts.indexOf('Evaluating your request');
        const toolStart = firstPrefixIndex(revealedTexts, 'Searching medical information');
        const toolEnd = revealedTexts.indexOf('Searching medical information');
        const answerStart = firstPrefixIndex(revealedTexts, 'Final answer');

        assert.ok(runStartEnd > -1);
        assert.ok(toolStart > runStartEnd);
        assert.ok(toolEnd > toolStart);
        assert.ok(answerStart > toolEnd);
        assert.equal(revealedTexts[revealedTexts.length - 1], 'Final answer');
    });

    it('keeps only the newest pending progress message', () => {
        const { streamEvent, flushReveals, revealFrames } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'first_tool',
            extensions: { toolProgress: 'First pending tool' },
        });
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-2',
            toolCallName: 'second_tool',
            extensions: { toolProgress: 'Newest pending tool' },
        });
        flushReveals();

        const revealedTexts = revealFrames().map((a) => a.payload.activity.text);
        assert.ok(revealedTexts.includes('Evaluating your request'));
        assert.ok(revealedTexts.includes('Newest pending tool'));
        assert.ok(!revealedTexts.includes('First pending tool'));
    });

    it('suppresses duplicate external typing once stream refresh begins', () => {
        const { forwarded, incoming, streamEvent } = createHarness();
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'medical_knowledge-run',
            extensions: { toolProgress: 'Searching medical information' },
        });
        const typing = incoming({ type: 'typing' });
        assert.ok(!forwarded.includes(typing));
    });

    it('replaces the progress line with the accumulating answer', () => {
        const { streamEvent, streamDelta, flushReveals, revealFrames } = createHarness();
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'medical_knowledge-run',
            extensions: { toolProgress: 'Searching medical information' },
        });
        flushReveals();
        streamDelta('Final answer');
        flushReveals();
        const frames = revealFrames();
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Final answer');
    });

    it('does not render internal events as progress', () => {
        const { streamEvent, flush, revealFrames } = createHarness();
        streamEvent({ type: 'TOOL_CALL_START', toolCallName: 'search' });
        streamEvent({ type: 'TOOL_CALL_ARGS', delta: '{"a":1}' });
        streamEvent({ type: 'TOOL_CALL_END', toolCallId: 'tc-1' });
        streamEvent({ type: 'TOOL_CALL_RESULT', toolCallId: 'tc-1' });
        streamEvent({ type: 'CUSTOM', name: 'safeguards', value: 'Checking safeguards' });
        streamEvent({ type: 'STATE_SNAPSHOT' });
        flush();
        assert.equal(revealFrames().length, 0);
    });

    it('does not overwrite the answer with progress events received after answer start', () => {
        const { streamDelta, streamEvent, flushReveals, revealFrames } = createHarness();
        streamDelta('The answer');
        flushReveals();
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-late',
            extensions: { toolProgress: 'Late progress' },
        });
        flushReveals();
        const revealedTexts = revealFrames().map((a) => a.payload.activity.text);
        assert.ok(!revealedTexts.includes('Late progress'));
        assert.equal(revealedTexts[revealedTexts.length - 1], 'The answer');
    });
});

describe('error and reset', () => {
    it('does not forward the raw RUN_ERROR envelope', () => {
        const { forwarded, streamEvent } = createHarness();
        const errorFrame = streamEvent({ type: 'RUN_ERROR', runId: 'run_1', value: 'INTERNAL_SERVER_ERROR' });
        assert.ok(!forwarded.includes(errorFrame));
    });

    it('lets the ordinary bot error activity replace the temporary bubble', () => {
        const { incoming, streamEvent } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        streamEvent({ type: 'RUN_ERROR', runId: 'run_1', value: 'INTERNAL_SERVER_ERROR' });
        const errorActivity = incoming({ type: 'message', text: 'Something went wrong.', from: { role: 'bot' } });
        assert.equal(errorActivity.payload.activity.id, 'has-stream-progress-0');
    });

    it('resets stream ids so a new turn gets a fresh bubble id', () => {
        const { streamDelta, sendUserMessage, incoming, flush } = createHarness();
        streamDelta('First');
        flush(20);
        sendUserMessage();
        streamDelta('Second');
        const finalCard = incoming({ type: 'message', text: 'Second', from: { role: 'bot' } });
        assert.equal(finalCard.payload.activity.id, 'has-stream-progress-1');
    });

    it('does not deliver stale timer callbacks from a previous turn', () => {
        const { streamDelta, sendUserMessage, flush, revealFrames } = createHarness();
        streamDelta('A partially revealed streamed answer');
        sendUserMessage();
        const revealCountAtReset = revealFrames().length;
        // A full drain must settle (no leaked timers) and produce no further reveals.
        flush();
        assert.equal(revealFrames().length, revealCountAtReset);
    });
});

describe('temporary bubble expiry', () => {
    it('retires the temporary bubble when no final activity ever arrives', () => {
        const { streamEvent, incoming, flush, flushReveals, advanceTime, revealFrames, forwarded } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        flushReveals();

        // No final activity arrives; let the visibility window elapse and drain.
        advanceTime(5 * 60 * 1000);
        flush();

        const reveals = revealFrames();
        const expired = reveals[reveals.length - 1].payload.activity;
        assert.equal(expired.text, '');
        assert.equal(expired.channelData.hasStreamExpired, true);

        // The bubble is retired: a late bot message is no longer reconciled onto it.
        const late = incoming({ type: 'message', text: 'Late final', from: { role: 'bot' } });
        assert.ok(forwarded.includes(late));
        assert.notEqual(late.payload.activity.id, 'has-stream-progress-0');
    });

    it('keeps the bubble alive while progress and answer content keep arriving', () => {
        const { streamEvent, streamDelta, flush, flushReveals, advanceTime, revealFrames } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        flushReveals();
        // Just before the window elapses, fresh content refreshes it.
        advanceTime(4 * 60 * 1000);
        streamDelta('Answer arriving in time');
        flushReveals();
        advanceTime(4 * 60 * 1000);

        const beforeDrain = revealFrames().map((a) => a.payload.activity.text);
        assert.equal(beforeDrain[beforeDrain.length - 1], 'Answer arriving in time');
        assert.ok(!beforeDrain.some((t) => t === ''));

        // Only once content stops for a full window does the bubble finally retire.
        flush();
        const afterDrain = revealFrames();
        assert.equal(afterDrain[afterDrain.length - 1].payload.activity.channelData.hasStreamExpired, true);
    });
});

describe('future compatibility (Option C boundary)', () => {
    it('swallows TOOL_CALL_CHUNK and does not render or corrupt the answer', () => {
        const { forwarded, streamEvent, streamDelta, flushReveals, revealFrames } = createHarness();
        const chunk = streamEvent({
            type: 'TOOL_CALL_CHUNK',
            toolCallId: 'tc-1',
            delta: 'chunk text that must not render',
        });
        flushReveals();
        assert.ok(!forwarded.includes(chunk));
        assert.equal(revealFrames().length, 0);

        streamDelta('Real answer');
        flushReveals();
        const frames = revealFrames();
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Real answer');
    });
});
