import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../../localization/i18n";
import { createEmptyDataset } from "../../platform/persistence";
import { SyncClientError, type SyncConflict } from "../../server/contracts/sync";
import { useLocalDatasetStore } from "../local-data/store/useLocalDatasetStore";
import { SyncSettings } from "./SyncSettings";

const coordinator = vi.hoisted(() => ({
  inspect: vi.fn(),
  enable: vi.fn(),
  run: vi.fn(),
  cancel: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("./SyncProvider", () => ({
  useSync: () => ({ coordinator, status: "disabled" }),
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ identity: { subject: "synthetic-owner" }, open: vi.fn() }),
}));
vi.mock("../../ui/theme", () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock("react-native", () => ({
  Pressable: "button",
  Text: "text",
  View: "view",
  Modal: "modal",
  ScrollView: "scroll",
  Platform: { OS: "web" },
  StyleSheet: { flatten: (style: unknown) => style },
}));
let tree: ReactTestRenderer | undefined;
function button(label: string) {
  const found = tree!.root
    .findAllByType("button")
    .find((node) =>
      node
        .findAllByType("text")
        .some((text) => text.children.join("") === label),
    );
  if (!found) throw new Error(`Missing synthetic test control: ${label}`);
  return found;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
  const dataset = createEmptyDataset();
  useLocalDatasetStore.setState({
    dataset,
    saveStatus: "idle",
    saveError: null,
  });
  coordinator.inspect.mockResolvedValue({
    datasetId: dataset.datasetId,
    ownerSubject: "synthetic-owner",
    empty: false,
  });
  coordinator.enable.mockResolvedValue(undefined);
  await act(async () => {
    tree = create(
      <I18nextProvider i18n={i18n}>
        <SyncSettings />
      </I18nextProvider>,
    );
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  await i18n.changeLanguage("en");
});
it("shows the upload notice before bootstrapping or enabling", async () => {
  expect(coordinator.inspect).not.toHaveBeenCalled();
  await act(async () => button("Enable sync").props.onPress());
  expect(coordinator.inspect).not.toHaveBeenCalled();
  expect(coordinator.enable).not.toHaveBeenCalled();
  coordinator.inspect.mockResolvedValueOnce({
    datasetId: createEmptyDataset().datasetId,
    ownerSubject: "synthetic-owner",
    empty: true,
  });
  await act(async () => button("Continue").props.onPress());
  expect(coordinator.enable).toHaveBeenCalledWith(
    "upload",
    expect.objectContaining({ empty: true }),
  );
});
it("requires a second explicit confirmation before replacing local records", async () => {
  await act(async () => button("Enable sync").props.onPress());
  await act(async () => button("Continue").props.onPress());
  expect(coordinator.enable).not.toHaveBeenCalled();
  await act(async () => button("Replace local data…").props.onPress());
  expect(coordinator.enable).not.toHaveBeenCalled();
  expect(
    tree!.root
      .findAllByType("text")
      .some((node) =>
        node.children.join("").includes("pending edits will be discarded"),
      ),
  ).toBe(true);
  await act(async () => button("Confirm replacement").props.onPress());
  expect(coordinator.enable).toHaveBeenCalledWith(
    "replace",
    expect.objectContaining({ empty: false }),
  );
});
it("offers merge separately and translates the controls", async () => {
  await act(async () => {
    await i18n.changeLanguage("es");
  });
  await act(async () => button("Activar sincronización").props.onPress());
  await act(async () => button("Continuar").props.onPress());
  await act(async () => button("Combinar").props.onPress());
  expect(coordinator.enable).toHaveBeenCalledWith(
    "merge",
    expect.objectContaining({ empty: false }),
  );
});
it("explains a different-login reset requirement without modifying records", async () => {
  const previous = useLocalDatasetStore.getState().dataset;
  coordinator.inspect.mockRejectedValueOnce(
    new SyncClientError("different_login"),
  );
  await act(async () => button("Enable sync").props.onPress());
  await act(async () => button("Continue").props.onPress());
  expect(coordinator.enable).not.toHaveBeenCalled();
  expect(useLocalDatasetStore.getState().dataset).toBe(previous);
  expect(
    tree!.root
      .findAllByType("text")
      .some((node) =>
        node.children.join("").includes("Cloud records stay intact"),
      ),
  ).toBe(true);
});

function transactionConflict(
  localCategoryId: string,
  cloudCategoryId: string,
): SyncConflict {
  const recordId = "018f47b0-0000-7000-8000-000000000001";
  const editedAt = "2026-10-05T12:00:00.000Z";
  const transaction = (categoryId: string) => ({
    id: recordId,
    amount: "12.5",
    currency: "USD" as const,
    type: "expense" as const,
    categoryId,
    description: "Synthetic category conflict",
    date: "2026-10-05",
    createdAt: editedAt,
    updatedAt: editedAt,
  });
  return {
    mutationId: "018f47b0-0000-7000-8000-000000000002",
    recordType: "transaction",
    recordId,
    cloudRecordId: recordId,
    localRevision: 1,
    cloudRevision: 2,
    localPayload: transaction(localCategoryId),
    cloudPayload: transaction(cloudCategoryId),
    localDeleted: false,
    cloudDeleted: false,
    localEditedAt: editedAt,
    cloudEditedAt: "2026-10-05T12:01:00.000Z",
    cloudCommittedAt: "2026-10-05T12:02:00.000Z",
    reason: "concurrent_edit",
    resolution: "pending",
  };
}

async function openTransactionConflict(conflict: SyncConflict) {
  const dataset = createEmptyDataset();
  await act(async () => {
    tree?.unmount();
    useLocalDatasetStore.setState({
      dataset: {
        ...dataset,
        sync: { ...dataset.sync!, conflicts: [conflict] },
      },
    });
    tree = create(
      <I18nextProvider i18n={i18n}>
        <SyncSettings />
      </I18nextProvider>,
    );
  });
  const reviewLabel = i18n.resolvedLanguage === "es"
    ? "Revisar conflicto: transaction"
    : "Review transaction conflict";
  await act(async () => button(reviewLabel).props.onPress());
}

it("shows the local and cloud transaction categories while retaining conflict timestamps", async () => {
  await openTransactionConflict(
    transactionConflict("expense-food", "expense-housing"),
  );
  const visibleText = tree!.root
    .findAllByType("text")
    .map((node) => node.children.join(""));
  const textContent = visibleText.join(" ");
  expect(textContent).toContain("Food");
  expect(textContent).toContain("Housing");
  expect(textContent).toContain("Device edit: ");
  expect(textContent).toContain("Cloud edit: ");
  expect(textContent).toContain("Server commit: ");
});

it("uses a localized safe label when a transaction category is unavailable", async () => {
  await act(async () => {
    await i18n.changeLanguage("es");
  });
  await openTransactionConflict(
    transactionConflict(
      "00000000-0000-4000-8000-000000000099",
      "expense-housing",
    ),
  );
  const visibleText = tree!.root
    .findAllByType("text")
    .map((node) => node.children.join(""));
  const textContent = visibleText.join(" ");
  expect(textContent).toContain("Categoría no disponible");
  expect(textContent).toContain("Vivienda");
  expect(textContent).toContain("Edición del dispositivo: ");
  expect(textContent).toContain("Edición de la nube: ");
  expect(textContent).toContain("Confirmación del servidor: ");
  expect(textContent).not.toContain("Sin categoría");
});
