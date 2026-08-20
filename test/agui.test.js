'use strict';

// Focused unit tests for the AG-UI event framework (src/agui/*).
//
// These complement test/streaming.test.js (which drives the controller end-to-end).
// Here we test the two seams directly:
//   - registry.ts   -> interpretEvent(): safe default for unknown events + typed
//                       interpretation of known ones.
//   - parseEnvelope.ts -> parseStreamEnvelope(): tolerant extraction of the event
//                       from a Direct Line activity.
//
// Loaded via Node's built-in TypeScript support, same as streaming.test.js.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { interpretEvent } = require('../src/agui/registry.ts');
const { parseStreamEnvelope, isStreamFrame } = require('../src/agui/parseEnvelope.ts');

describe('interpretEvent (registry)', () => {
    it('maps RUN_STARTED to a safe progress line', () => {
        const result = interpretEvent({ type: 'RUN_STARTED', runId: 'run_1' });
        assert.equal(result.progressText, 'Evaluating your request');
        assert.equal(result.answerDelta, '');
    });

    it('surfaces the injected tool progress, never the raw tool name', () => {
        const result = interpretEvent({
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'medical_knowledge-run',
            extensions: { toolProgress: 'Looking up side effects' },
        });
        assert.equal(result.progressText, 'Looking up side effects');
        assert.equal(result.answerDelta, '');
    });

    it('yields no progress for a tool call without an injected progress line', () => {
        const result = interpretEvent({ type: 'TOOL_CALL_START', toolCallName: 'search' });
        assert.equal(result.progressText, '');
    });

    it('maps TEXT_MESSAGE_CONTENT.delta to answer text', () => {
        const result = interpretEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: 'Hello' });
        assert.equal(result.answerDelta, 'Hello');
        assert.equal(result.progressText, '');
    });

    it('ignores a non-string delta (hardening against malformed input)', () => {
        assert.equal(interpretEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: { a: 1 } }).answerDelta, '');
        assert.equal(interpretEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: 42 }).answerDelta, '');
    });

    it('does NOT treat TOOL_CALL_CHUNK.delta as answer text (deferred to Step 4)', () => {
        const result = interpretEvent({ type: 'TOOL_CALL_CHUNK', delta: 'must not render' });
        assert.equal(result.answerDelta, '');
        assert.equal(result.progressText, '');
    });

    it('safe default: an unknown event type is ignored, never throws', () => {
        let result;
        assert.doesNotThrow(() => {
            result = interpretEvent({ type: 'SOME_FUTURE_EVENT', foo: 'bar' });
        });
        assert.deepEqual(result, { progressText: '', answerDelta: '' });
    });

    it('unmodelled events (incl. HAS events not wired up yet) go through the safe default', () => {
        // TOOL_CALL_STREAM / SAFEGUARDS_UPDATE exist upstream but this sample does not
        // act on them yet, so they are handled by the safe default like any unknown.
        assert.deepEqual(
            interpretEvent({ type: 'SAFEGUARDS_UPDATE', message: 'ok' }),
            { progressText: '', answerDelta: '' },
        );
        assert.deepEqual(
            interpretEvent({ type: 'TOOL_CALL_STREAM', toolCallId: 'tc-1' }),
            { progressText: '', answerDelta: '' },
        );
    });
});

describe('parseStreamEnvelope', () => {
    it('extracts the event and streamId from a streaming message activity', () => {
        const frame = parseStreamEnvelope({
            type: 'message',
            value: { stream: { streamId: 'run_1', event: { type: 'RUN_STARTED' } } },
        });
        assert.ok(frame);
        assert.equal(frame.streamId, 'run_1');
        assert.equal(frame.event.type, 'RUN_STARTED');
    });

    it('returns null for non-streaming or malformed activities (never throws)', () => {
        assert.equal(parseStreamEnvelope(null), null);
        assert.equal(parseStreamEnvelope({ type: 'typing' }), null);
        assert.equal(parseStreamEnvelope({ type: 'message', text: 'hi' }), null);
        assert.equal(parseStreamEnvelope({ type: 'message', value: { stream: {} } }), null);
        assert.equal(
            parseStreamEnvelope({ type: 'message', value: { stream: { event: {} } } }),
            null,
        );
    });
});

describe('isStreamFrame', () => {
    it('is true for any message carrying a stream payload, even a malformed one', () => {
        assert.equal(
            isStreamFrame({ type: 'message', value: { stream: { streamId: 'run_1', event: {} } } }),
            true,
        );
        assert.equal(isStreamFrame({ type: 'message', value: { stream: {} } }), true);
    });

    it('is false for non-stream activities (never throws)', () => {
        assert.equal(isStreamFrame(null), false);
        assert.equal(isStreamFrame({ type: 'typing' }), false);
        assert.equal(isStreamFrame({ type: 'message', text: 'hi' }), false);
    });
});
