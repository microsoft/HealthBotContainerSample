import { describe, it, expect, beforeEach } from "vitest";
import { createLocaleController, extractLocale } from "./locale";

describe("extractLocale", () => {
  it("falls back to en-US when no locale param is given", () => {
    expect(extractLocale(null)).toBe("en-US");
    expect(extractLocale("")).toBe("en-US");
  });

  it("uses the browser language for autodetect", () => {
    expect(extractLocale("autodetect")).toBe(navigator.language);
  });

  it("passes an explicit locale through", () => {
    expect(extractLocale("fr-FR")).toBe("fr-FR");
  });
});

describe("createLocaleController", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("lang");
  });

  it("adopts the initial locale and sets <html lang>", () => {
    const controller = createLocaleController("he-IL");
    expect(controller.get()).toBe("he-IL");
    expect(document.documentElement.getAttribute("lang")).toBe("he");
  });

  it("defaults a malformed initial locale to en-US", () => {
    expect(createLocaleController("english").get()).toBe("en-US");
  });

  it("adopts a valid bot-declared locale and updates <html lang>", () => {
    const controller = createLocaleController("en-US");
    controller.setFromBot("fr-FR");
    expect(controller.get()).toBe("fr-FR");
    expect(document.documentElement.getAttribute("lang")).toBe("fr");
  });

  it("accepts script-and-region tags such as zh-Hans-CN", () => {
    const controller = createLocaleController("en-US");
    controller.setFromBot("zh-Hans-CN");
    expect(controller.get()).toBe("zh-Hans-CN");
    expect(document.documentElement.getAttribute("lang")).toBe("zh");
  });

  it("ignores a malformed bot-declared locale", () => {
    const controller = createLocaleController("en-US");
    controller.setFromBot("notalocale");
    controller.setFromBot(42);
    controller.setFromBot(undefined);
    expect(controller.get()).toBe("en-US");
  });

  it("tags an outgoing user activity with the current locale", () => {
    const controller = createLocaleController("en-US");
    controller.setFromBot("es-ES");
    const activity: { locale?: string } = {};
    controller.tagUserActivity(activity);
    expect(activity.locale).toBe("es-ES");
  });
});
