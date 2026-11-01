const fluent = (token: string) => `var(--webchat-${token})`;

export const styleOptions = {
  botAvatarInitials: "Bot",
  userAvatarInitials: "You",
  bubbleMessageMaxWidth: 10_000,
};

const typeRamp = {
  small: { fontSize: 12, lineHeight: 16 },
  default: { fontSize: 14, lineHeight: 20 },
  medium: { fontSize: 16, lineHeight: 22 },
  large: { fontSize: 20, lineHeight: 28 },
  extraLarge: { fontSize: 24, lineHeight: 32 },
};

const rampBy = (key: "fontSize" | "lineHeight") =>
  Object.fromEntries(
    Object.entries(typeRamp).map(([size, ramp]) => [size, ramp[key]])
  );

const cardText = {
  default: {
    default: fluent("colorNeutralForeground1"),
    subtle: fluent("colorNeutralForeground3"),
  },
};

const containerStyle = (backgroundColor: string) => ({
  backgroundColor,
  foregroundColors: cardText,
});

export const adaptiveCardsHostConfig = {
  fontFamily: fluent("fontFamilyBase"),
  fontSizes: rampBy("fontSize"),
  lineHeights: rampBy("lineHeight"),
  spacing: { padding: 16 },
  containerStyles: {
    default: {
      foregroundColors: {
        ...cardText,
        accent: {
          default: fluent("colorBrandForegroundLink"),
          subtle: fluent("colorBrandForegroundLink"),
        },
      },
    },
    emphasis: containerStyle("#F9F9F9"),
    accent: containerStyle("#C7DEF9"),
    good: containerStyle("#CCFFCC"),
    attention: containerStyle("#FFC5B2"),
    warning: containerStyle("#FFE2B2"),
  },
  actions: {
    actionAlignment: "stretch",
    actionsOrientation: "vertical",
    buttonSpacing: 8,
    maxActions: 100,
    showCard: { actionMode: "inline", inlineTopMargin: 8 },
    spacing: "default",
  },
  factSet: { spacing: 8 },
  textBlock: { headingLevel: 2 },
};
