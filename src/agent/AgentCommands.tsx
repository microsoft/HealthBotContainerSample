// Built-in Health Bot agent commands. Add your own entries to send other programmed messages.
const COMMANDS = [
  { label: 'List', message: 'list' },
  { label: 'Connect', message: 'connect' },
  { label: 'End conversation', message: 'disconnect' },
  { label: 'Options', message: 'options' },
];

export default function AgentCommands({ send }: { send: (message: string) => void }) {
  return (
    <div className="agent-buttons">
      {COMMANDS.map(({ label, message }) => (
        <button key={message} type="button" onClick={() => send(message)}>
          {label}
        </button>
      ))}
    </div>
  );
}
