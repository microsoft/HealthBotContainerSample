import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, ReactElement } from "react";
import { createPortal } from "react-dom";
import {
  MicrophoneButton,
  type MicrophoneButtonClassNames,
} from "../MicrophoneButton/MicrophoneButton";

type SendBoxProps = Record<string, unknown>;
type SendBox = ComponentType<SendBoxProps>;

const SEND_BUTTON_SELECTOR = '[data-testid="send box send button"]';

export function deriveClassNames(
  sendButton: Element
): MicrophoneButtonClassNames {
  const buttonTokens = Array.from(sendButton.classList);
  const base =
    buttonTokens.find((token) => token.endsWith("sendbox__toolbar-button")) ??
    "";
  const iconTokens = Array.from(sendButton.firstElementChild?.classList ?? []);

  return {
    button: buttonTokens.join(" "),
    active: base && `${base}--active`,
    pulse: base && `${base}--with-pulse`,
    icon: iconTokens
      .map((token) => token.replace(/icon--send$/, "icon--microphone"))
      .join(" "),
  };
}

function SendBoxWithToolbarButtons({
  SendBox,
  ...props
}: SendBoxProps & { SendBox: SendBox }): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [host] = useState(() => {
    const element = document.createElement("span");
    element.style.display = "contents";
    return element;
  });
  const [classNames, setClassNames] = useState<MicrophoneButtonClassNames>();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const place = () => {
      const sendButton = root.querySelector(SEND_BUTTON_SELECTOR);
      if (!sendButton?.parentElement) {
        host.remove();
        setClassNames(undefined);
        return;
      }
      if (host.nextElementSibling !== sendButton) {
        sendButton.parentElement.insertBefore(host, sendButton);
      }
      const next = deriveClassNames(sendButton);
      setClassNames((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      );
    };

    place();
    const observer = new MutationObserver(place);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      host.remove();
    };
  }, [host]);

  return (
    <div ref={rootRef} style={{ display: "contents" }}>
      <SendBox {...props} />
      {classNames &&
        createPortal(<MicrophoneButton classNames={classNames} />, host)}
    </div>
  );
}

const sendBoxesWithToolbarButtons = new WeakMap<SendBox, SendBox>();

function withToolbarButtons(SendBox: SendBox): SendBox {
  let Wrapped = sendBoxesWithToolbarButtons.get(SendBox);
  if (!Wrapped) {
    Wrapped = (props: SendBoxProps) => (
      <SendBoxWithToolbarButtons SendBox={SendBox} {...props} />
    );
    sendBoxesWithToolbarButtons.set(SendBox, Wrapped);
  }
  return Wrapped;
}

export const sendBoxMiddleware = [
  () =>
    (next: (request: unknown) => SendBox | false | undefined) =>
    (request: unknown) => {
      const SendBox = next(request);
      return SendBox ? withToolbarButtons(SendBox) : SendBox;
    },
];
