import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackerSwitcher } from "./TrackerSwitcher";

const fixture = vi.hoisted(() => ({
  active: { kind: "personal", role: "admin", datasetId: "personal-dataset", membershipId: null, name: "Personal", archived: false },
  summaries: [
    { kind: "personal", role: "admin", datasetId: "personal-dataset", membershipId: null, name: "Personal", archived: false },
    { kind: "shared", role: "admin", datasetId: "family-dataset", membershipId: "family-membership", name: "Synthetic family", archived: false },
  ],
  selectTracker: vi.fn(async () => true),
}));

vi.mock("react-native", () => ({ Modal: "modal", Pressable: "button", View: "view" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: "en" } }) }));
vi.mock("../../ui/AppText", () => ({ AppText: "text" }));
vi.mock("../../ui/theme", () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock("../../platform/analytics/SensitiveContent", () => ({ SensitiveContent: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./store", () => ({
  selectTracker: fixture.selectTracker,
  useTrackerRegistry: (selector: (state: { summaries: typeof fixture.summaries; activeSummary: typeof fixture.active }) => unknown) =>
    selector({ summaries: fixture.summaries, activeSummary: fixture.active }),
}));

let tree: ReactTestRenderer;

function buttonWithText(value: string) {
  return tree.root.findAllByType("button").reverse().find(node =>
    node.findAllByType("text").map(text => text.children.join("")).join("\n") === value,
  );
}

function modal() {
  return tree.root.findAll(node => String(node.type) === "modal")[0]!;
}

async function press(label: string) {
  const button = buttonWithText(label);
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
    await Promise.resolve();
  });
}

describe("TrackerSwitcher", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    fixture.selectTracker.mockReset();
    fixture.active = { kind: "personal", role: "admin", datasetId: "personal-dataset", membershipId: null, name: "Personal", archived: false };
    fixture.summaries = [
      fixture.active,
      { kind: "shared", role: "admin", datasetId: "family-dataset", membershipId: "family-membership", name: "Synthetic family", archived: false },
    ];
  });

  afterEach(async () => { await act(async () => tree?.unmount()); });

  it("keeps the dialog open while loading, reports a false selection, and closes after a successful retry", async () => {
    let resolveFirst!: (selected: boolean) => void;
    const firstSelection = new Promise<boolean>(resolve => { resolveFirst = resolve; });
    fixture.selectTracker.mockReturnValueOnce(firstSelection).mockResolvedValueOnce(true);
    await act(async () => { tree = create(<TrackerSwitcher />); });

    await press("Personal ⌄");
    expect(modal().props.visible).toBe(true);
    await press("Synthetic family · Admin");

    expect(modal().props.visible).toBe(true);
    expect(tree.root.findAllByType("text").some(node => node.children.join("") === "Loading tracker…")).toBe(true);
    const choices = tree.root.findAllByType("button").filter(node =>
      ["Personal", "Synthetic family · Admin"].includes(node.findAllByType("text").map(text => text.children.join("")).join("\n")),
    );
    expect(choices).toHaveLength(2);
    expect(choices.every(choice => choice.props.disabled === true)).toBe(true);

    await act(async () => {
      resolveFirst(false);
      await firstSelection;
    });
    expect(modal().props.visible).toBe(true);
    expect(tree.root.findAllByType("text").some(node => node.children.join("") === "Could not open the tracker. Try again.")).toBe(true);

    await press("Synthetic family · Admin");
    expect(fixture.selectTracker).toHaveBeenCalledTimes(2);
    expect(modal().props.visible).toBe(false);
  });
});
