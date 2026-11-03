import { useDirectLineToken } from './chat/useDirectLineToken';
import Chat from './chat/Chat';

// Top-level app: acquire the Direct Line token, then hand it to the Web Chat client.
export default function App() {
  const { status, tokenPayload, jsonWebToken, error } = useDirectLineToken();

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

  return <Chat tokenPayload={tokenPayload} jsonWebToken={jsonWebToken} />;
}
