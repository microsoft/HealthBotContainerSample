import { useState } from 'react';
import type { FormEvent } from 'react';
import { useDirectLineToken } from '../chat/useDirectLineToken';
import type { TokenRequest } from '../chat/useDirectLineToken';
import Chat from '../chat/Chat';
import AgentCommands from './AgentCommands';

// Sample-only login: any values are accepted. Replace it, and `isAgentAuthenticated` in
// server.js, with real agent authentication before using this in production.
function LoginForm({ onSubmit }: { onSubmit: (request: TokenRequest) => void }) {
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ userName, userId, agent: true });
  };

  return (
    <form className="agent-login" onSubmit={submit}>
      <h2>Login page</h2>
      <label htmlFor="user-name">Enter your name (as it should appear in the chat)</label>
      <input
        id="user-name"
        type="text"
        value={userName}
        onChange={(event) => setUserName(event.target.value)}
      />
      <label htmlFor="user-id">Enter login ID here</label>
      <input
        id="user-id"
        type="text"
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
      />
      <button id="submit-btn" type="submit">
        Log In
      </button>
    </form>
  );
}

function AgentSession({ request }: { request: TokenRequest }) {
  const { status, tokenPayload, jsonWebToken, error } = useDirectLineToken(request);

  if (status === 'error') {
    return (
      <div className="hb-status hb-status--error" role="alert">
        {error || 'Unable to start the conversation.'}
      </div>
    );
  }

  if (status === 'loading' || !tokenPayload || !jsonWebToken) {
    return <div className="hb-status">Connecting to Health Bot…</div>;
  }

  return (
    <Chat
      tokenPayload={tokenPayload}
      jsonWebToken={jsonWebToken}
      renderSidebar={(send) => <AgentCommands send={send} />}
    />
  );
}

export default function AgentApp() {
  const [request, setRequest] = useState<TokenRequest | null>(null);

  return (
    <div className="agent-app">
      <h1>Agent Webchat</h1>
      <div className="agent-app__body">
        {request ? <AgentSession request={request} /> : <LoginForm onSubmit={setRequest} />}
      </div>
    </div>
  );
}
