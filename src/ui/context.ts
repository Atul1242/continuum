import type { Shared, WidgetType, WorkflowStep } from "../core/doc";
import type { Identity } from "../core/identity";
import type { SyncProvider } from "../core/provider";
import type { SessionController } from "../core/session";
import type { ConflictWatcher } from "../core/conflicts";

// The surface the UI modules are allowed to touch. main.ts implements it. This
// keeps rendering code declarative — it reads `ui` and calls actions, and never
// reaches into Yjs or the network layer on its own.

export interface UIState {
  selectedId: string | null;
  workflowStep: WorkflowStep;
  inspectorTab: "edit" | "data";
  composer: { type: WidgetType; title: string } | null;
  showActivity: boolean;
  draggingId: string | null;
}

export interface AppContext {
  shared: Shared;
  identity: Identity;
  provider: SyncProvider;
  session: SessionController;
  conflicts: ConflictWatcher;
  ui: UIState;

  select(id: string | null): void;
  setWorkflow(step: WorkflowStep): void;
  setInspectorTab(tab: "edit" | "data"): void;

  openComposer(type: WidgetType): void;
  updateComposer(part: Partial<{ type: WidgetType; title: string }>): void;
  commitComposer(): void;
  cancelComposer(): void;

  editDraft(widgetId: string, field: string, value: unknown): void;
  saveWidget(widgetId: string): void;
  discardWidget(widgetId: string): void;
  deleteWidget(widgetId: string): void;
  moveWidgetTo(widgetId: string, x: number, y: number): void;
  resizeWidgetTo(widgetId: string, w: number, h: number): void;

  renameWorkspace(name: string): void;
  copyShareLink(): void;

  toggleOffline(): void;
  toggleActivity(): void;

  renderAll(): void;
}
