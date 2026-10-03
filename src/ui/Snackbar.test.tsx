import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Pressable, View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Snackbar } from "./Snackbar";
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  AccessibilityInfo: { announceForAccessibility: vi.fn() },
  View: "div",
  Text: "span",
  Pressable: "button",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "i" }));
vi.mock("./theme", () => ({
  useThemedStyles: (factory: (value: unknown) => unknown) => factory({}),
}));
let tree: ReactTestRenderer;
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.useRealTimers();
});
describe("voice snackbar accessibility", () => {
  it("pauses for hover/focus and resumes the remaining eight-second duration", async () => {
    vi.useFakeTimers();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const dismiss = vi.fn();
    const edit = vi.fn();
    await act(async () => {
      tree = create(
        <Snackbar
          message="Synthetic saved expense"
          durationMs={8000}
          onDismiss={dismiss}
          actionLabel="Edit"
          onAction={edit}
        />,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      tree.root.findByType(View).props.onPointerEnter();
    });
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(dismiss).not.toHaveBeenCalled();
    const action = tree.root.findAllByType(Pressable)[0]!;
    await act(async () => {
      action.props.onFocus();
      tree.root.findByType(View).props.onPointerLeave();
    });
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(dismiss).not.toHaveBeenCalled();
    await act(async () => {
      action.props.onPress();
      action.props.onBlur();
    });
    expect(edit).toHaveBeenCalledOnce();
    await act(async () => {
      vi.advanceTimersByTime(5999);
    });
    expect(dismiss).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
