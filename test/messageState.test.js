'use strict';

// Unit tests for the structured-state spine (src/agui/messageState + registry.reduceEvent
// + messageStore). These cover the AG-UI-aligned reducer and the external store that
// React subscribes to. Loaded via Node's built-in TypeScript support, like the others.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createInitialMessageState } = require('../src/agui/messageState.ts');
const { reduceEvent, interpretEvent } = require('../src/agui/registry.ts');
const { createMessageStore } = require('../src/agui/messageStore.ts');

describe('reduceEvent (structured registry)', () => {
    it('RUN_STARTED moves to a thinking progress state', () => {
        const s = reduceEvent(createInitialMessageState(), { type: 'RUN_STARTED', runId: 'r1' });
        assert.equal(s.variant, 'progress');
        assert.equal(s.avatarState, 'thinking');
        assert.equal(s.progressText, 'Evaluating your request');
    });

    it('TOOL_CALL_START appends a reasoning step using the injected progress line', () => {
        const s = reduceEvent(createInitialMessageState(), {
            type: 'TOOL_CALL_START',
            toolCallId: 'tc-1',
            toolCallName: 'medical_knowledge-run',
            extensions: { toolProgress: 'Looking up side effects' },
        });
        assert.equal(s.reasoningSteps.length, 1);
        assert.deepEqual(s.reasoningSteps[0], {
            id: 'tc-1',
            label: 'Looking up side effects',
            status: 'active',
        });
        // never surfaces the raw tool name
        assert.ok(!JSON.stringify(s).includes('medical_knowledge-run'));
    });

    it('falls back to a positional step id when toolCallId is absent', () => {
        let s = createInitialMessageState();
        s = reduceEvent(s, { type: 'TOOL_CALL_START', extensions: { toolProgress: 'A' } });
        s = reduceEvent(s, { type: 'TOOL_CALL_START', extensions: { toolProgress: 'B' } });
        assert.deepEqual(s.reasoningSteps.map((x) => x.id), ['step-0', 'step-1']);
    });

    it('TEXT_MESSAGE_CONTENT accumulates answer text and flips to the answer variant', () => {
        let s = createInitialMessageState();
        s = reduceEvent(s, { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hel' });
        s = reduceEvent(s, { type: 'TEXT_MESSAGE_CONTENT', delta: 'lo' });
        assert.equal(s.answerText, 'Hello');
        assert.equal(s.variant, 'answer');
    });

    it('RUN_ERROR switches to the error variant', () => {
        const s = reduceEvent(createInitialMessageState(), { type: 'RUN_ERROR', message: 'boom' });
        assert.equal(s.variant, 'error');
        assert.equal(s.avatarState, 'done');
    });

    it('returns the SAME reference for no-op events (snapshot stability)', () => {
        const prev = createInitialMessageState();
        assert.equal(reduceEvent(prev, { type: 'SOME_FUTURE_EVENT' }), prev);
        assert.equal(reduceEvent(prev, { type: 'TEXT_MESSAGE_CONTENT', delta: '' }), prev);
        assert.equal(reduceEvent(prev, { type: 'TEXT_MESSAGE_CONTENT', delta: 42 }), prev);
    });

    it('does not mutate the previous state (immutability)', () => {
        const prev = createInitialMessageState();
        const snapshot = JSON.stringify(prev);
        reduceEvent(prev, { type: 'TEXT_MESSAGE_CONTENT', delta: 'x' });
        assert.equal(JSON.stringify(prev), snapshot);
    });

    it('keeps text interpretation consistent with interpretEvent', () => {
        const ev = { type: 'TEXT_MESSAGE_CONTENT', delta: 'hi' };
        assert.equal(reduceEvent(createInitialMessageState(), ev).answerText, interpretEvent(ev).answerDelta);
    });
});

describe('messageStore (external store)', () => {
    it('has no state for an unknown id (stable undefined)', () => {
        const store = createMessageStore();
        assert.equal(store.getSnapshot('nope'), undefined);
    });

    it('applyEvent creates and evolves state for an id', () => {
        const store = createMessageStore();
        store.applyEvent('has-stream-progress-0', { type: 'RUN_STARTED' });
        store.applyEvent('has-stream-progress-0', { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hi' });
        const s = store.getSnapshot('has-stream-progress-0');
        assert.equal(s.answerText, 'Hi');
        assert.equal(s.variant, 'answer');
    });

    it('returns a STABLE reference across a no-op event (no needless re-render)', () => {
        const store = createMessageStore();
        store.applyEvent('id', { type: 'TEXT_MESSAGE_CONTENT', delta: 'a' });
        const before = store.getSnapshot('id');
        store.applyEvent('id', { type: 'SOME_FUTURE_EVENT' });
        assert.equal(store.getSnapshot('id'), before);
    });

    it('notifies subscribers only on a real change', () => {
        const store = createMessageStore();
        let count = 0;
        const unsub = store.subscribe(() => { count += 1; });
        store.applyEvent('id', { type: 'TEXT_MESSAGE_CONTENT', delta: 'a' }); // change
        store.applyEvent('id', { type: 'SOME_FUTURE_EVENT' });               // no-op
        assert.equal(count, 1);
        unsub();
        store.applyEvent('id', { type: 'TEXT_MESSAGE_CONTENT', delta: 'b' }); // after unsub
        assert.equal(count, 1);
    });

    it('reset drops an id and notifies', () => {
        const store = createMessageStore();
        let count = 0;
        store.applyEvent('id', { type: 'RUN_STARTED' });
        store.subscribe(() => { count += 1; });
        store.reset('id');
        assert.equal(store.getSnapshot('id'), undefined);
        assert.equal(count, 1);
        store.reset('id'); // already gone -> no notification
        assert.equal(count, 1);
    });

    it('isolates state per id', () => {
        const store = createMessageStore();
        store.applyEvent('a', { type: 'TEXT_MESSAGE_CONTENT', delta: 'A' });
        store.applyEvent('b', { type: 'TEXT_MESSAGE_CONTENT', delta: 'B' });
        assert.equal(store.getSnapshot('a').answerText, 'A');
        assert.equal(store.getSnapshot('b').answerText, 'B');
    });
});
