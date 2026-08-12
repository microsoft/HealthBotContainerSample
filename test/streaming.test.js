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
// on flush(), not recursively at schedule time), and a mutable clock drives the hard cap.

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

    // Fake timer queue: scheduled callbacks run on flush(), not at schedule time.
    let timerId = 0;
    let now = 1700000000000;
    const timers = new Map();
    const flush = (maxCallbacks = 200) => {
        let guard = 0;
        while (timers.size && guard++ < maxCallbacks) {
            const [id, fn] = timers.entries().next().value;
            timers.delete(id);
            fn();
        }
    };

    const context = createContext({
        window: {},
        setTimeout: (fn) => {
            const id = ++timerId;
            timers.set(id, fn);
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

    it('keeps the native typing row below streamed frames and refreshes it', () => {
        const { forwarded, incoming, streamEvent, flush, typingFrames } = createHarness();
        incoming({ type: 'typing', from: { role: 'bot', id: 'real-bot' }, channelData: { typingStyle: 'grey' } });
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        flush(60);

        const revealIndexes = forwarded.flatMap((action, index) =>
            action.payload.activity.channelData && action.payload.activity.channelData.hasStreamReveal ? [index] : []
        );
        assert.ok(revealIndexes.length > 0);
        assert.ok(revealIndexes.every((index) =>
            forwarded[index + 1] &&
            forwarded[index + 1].payload.activity.channelData &&
            forwarded[index + 1].payload.activity.channelData.hasStreamTyping
        ));

        const streamTyping = typingFrames();
        assert.ok(streamTyping.length > revealIndexes.length);
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
        const { streamDelta, flush, revealFrames } = createHarness();
        streamDelta('Hello ');
        flush();
        streamDelta('world');
        flush();
        const frames = revealFrames();
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Hello world');
    });

    it('reveals frames under the single streaming bubble id', () => {
        const { streamDelta, revealFrames } = createHarness();
        streamDelta('Answer text');
        assert.equal(revealFrames()[0].payload.activity.id, 'has-stream-progress-0');
    });

    it('clears the previous answer buffer when the streamId changes', () => {
        const { streamDelta, flush, revealFrames } = createHarness();
        streamDelta('AAA', 'run_1');
        flush();
        streamDelta('BBBBBBBBBB', 'run_2');
        flush();
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
        const { streamEvent, flush, revealFrames } = createHarness();
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'generate_answer',
            extensions: { toolProgress: 'Drafting a prior authorization note' },
        });
        flush();
        const frames = revealFrames();
        assert.ok(frames.length > 0);
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Drafting a prior authorization note');
    });

    it('renders run start as evaluating the request', () => {
        const { streamEvent, flush, revealFrames } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        flush();
        const frames = revealFrames();
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Evaluating your request');
    });

    it('finishes each progress message before revealing the next stream', () => {
        const { streamEvent, streamDelta, flush, revealFrames } = createHarness();
        streamEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'medical_knowledge-run',
            extensions: { toolProgress: 'Searching medical information' },
        });
        streamDelta('Final answer');
        flush();

        const revealedTexts = revealFrames().map((a) => a.payload.activity.text);
        const runStartEnd = revealedTexts.indexOf('Evaluating your request');
        const toolStart = revealedTexts.indexOf('S');
        const toolEnd = revealedTexts.indexOf('Searching medical information');
        const answerStart = revealedTexts.indexOf('Fi');

        assert.ok(runStartEnd > -1);
        assert.ok(toolStart > runStartEnd);
        assert.ok(toolEnd > toolStart);
        assert.ok(answerStart > toolEnd);
        assert.equal(revealedTexts[revealedTexts.length - 1], 'Final answer');
    });

    it('keeps only the newest pending progress message', () => {
        const { streamEvent, flush, revealFrames } = createHarness();
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
        flush();

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
        const { streamEvent, streamDelta, flush, revealFrames } = createHarness();
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'medical_knowledge-run',
            extensions: { toolProgress: 'Searching medical information' },
        });
        flush();
        streamDelta('Final answer');
        flush();
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
        const { streamDelta, streamEvent, flush, revealFrames } = createHarness();
        streamDelta('The answer');
        flush();
        streamEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-late',
            extensions: { toolProgress: 'Late progress' },
        });
        flush();
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
        flush(200);
        assert.equal(revealFrames().length, revealCountAtReset);
    });
});

describe('future compatibility (Option C boundary)', () => {
    it('swallows TOOL_CALL_CHUNK and does not render or corrupt the answer', () => {
        const { forwarded, streamEvent, streamDelta, flush, revealFrames } = createHarness();
        const chunk = streamEvent({
            type: 'TOOL_CALL_CHUNK',
            toolCallId: 'tc-1',
            delta: 'chunk text that must not render',
        });
        flush();
        assert.ok(!forwarded.includes(chunk));
        assert.equal(revealFrames().length, 0);

        streamDelta('Real answer');
        flush();
        const frames = revealFrames();
        assert.equal(frames[frames.length - 1].payload.activity.text, 'Real answer');
    });
});
