import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Pressable } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceEntryButton } from "./VoiceEntryButton";
const voice = vi.hoisted(() => ({
  phase: "idle",
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-native", () => ({
  View: "div",
  Text: "span",
  Pressable: "button",
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "i" }));
vi.mock("../../ui/theme", () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock("./VoiceProvider", () => ({ useVoice: () => voice }));
let tree: ReactTestRenderer;
afterEach(async () => {
  await act(async () => tree.unmount());
  vi.clearAllMocks();
  voice.phase = "idle";
});
describe("hold and accessible recording controls", () => {
  it("keeps the hold target active while microphone preparation is pending", async () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => {
      tree = create(<VoiceEntryButton />);
    });
    await act(async () => {
      tree.root.findAllByType(Pressable)[0]!.props.onPressIn();
    });
    expect(voice.start).toHaveBeenCalledOnce();
    voice.phase = "starting";
    await act(async () => {
      tree.update(<VoiceEntryButton />);
    });
    const [hold, toggle] = tree.root.findAllByType(Pressable);
    expect(hold!.props.disabled).toBe(false);
    expect(toggle!.props.disabled).toBe(true);
    await act(async () => {
      hold!.props.onPressOut();
    });
    expect(voice.stop).toHaveBeenCalledOnce();
  });
  it("offers keyboard/screen-reader start and stop without a hold gesture", async () => {
    await act(async () => {
      tree = create(<VoiceEntryButton />);
    });
    await act(async () => {
      tree.root.findAllByType(Pressable)[1]!.props.onPress();
    });
    expect(voice.start).toHaveBeenCalledOnce();
    voice.phase = "recording";
    await act(async () => {
      tree.update(<VoiceEntryButton />);
    });
    await act(async () => {
      tree.root.findAllByType(Pressable)[1]!.props.onPress();
    });
    expect(voice.stop).toHaveBeenCalledOnce();
  });
});
