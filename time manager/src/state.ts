import type {
  AppData,
  Project,
  WeekData,
  TimeBlock,
  Template,
  DayOfWeek,
  ProjectBalance,
  WeeklyStanding,
} from "./types";
import {
  generateId,
  getMonday,
  getWeekKey,
  toDateString,
  SLOT_MINUTES,
  PROJECT_PALETTE,
} from "./types";
import { loadAppData, saveAppData, saveProjects, saveWeek, saveTemplates } from "./storage";

// ============================================================
// Application State
// ============================================================

let appData: AppData = { projects: [], weeks: [], templates: [], weeklyHourGoal: 40 };
let currentMonday: Date = getMonday(new Date());
let listeners: (() => void)[] = [];
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

const SAVE_DEBOUNCE_MS = 500;

export function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notify(): void {
  listeners.forEach((l) => l());
}

function debouncedSaveWeek(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const week = getCurrentWeekData();
    saveWeek(week).catch(console.error);
  }, SAVE_DEBOUNCE_MS);
}

// ============================================================
// Initialization
// ============================================================

export async function initState(): Promise<void> {
  appData = await loadAppData();
  // Set default weekly hour goal if not present
  if (!appData.weeklyHourGoal) {
    appData.weeklyHourGoal = 40;
  }
  currentMonday = getMonday(new Date());
  ensureCurrentWeek();
  notify();
}

function ensureCurrentWeek(): void {
  const key = getWeekKey(currentMonday);
  if (!appData.weeks.find((w) => w.weekKey === key)) {
    appData.weeks.push({
      weekKey: key,
      startDate: toDateString(currentMonday),
      blocks: [],
    });
  }
}

// ============================================================
// Week Navigation
// ============================================================

export function getCurrentMonday(): Date {
  return new Date(currentMonday);
}

export function getCurrentWeekKey(): string {
  return getWeekKey(currentMonday);
}

export function navigateWeek(direction: -1 | 1): void {
  const newMonday = new Date(currentMonday);
  newMonday.setDate(newMonday.getDate() + direction * 7);
  currentMonday = newMonday;
  ensureCurrentWeek();
  notify();
}

export function goToToday(): void {
  currentMonday = getMonday(new Date());
  ensureCurrentWeek();
  notify();
}

// ============================================================
// Week Data Access
// ============================================================

export function getCurrentWeekData(): WeekData {
  const key = getWeekKey(currentMonday);
  return (
    appData.weeks.find((w) => w.weekKey === key) || {
      weekKey: key,
      startDate: toDateString(currentMonday),
      blocks: [],
    }
  );
}

export function getWeekDataByKey(weekKey: string): WeekData | undefined {
  return appData.weeks.find((w) => w.weekKey === weekKey);
}

export function getAllWeeks(): WeekData[] {
  return appData.weeks;
}

// ============================================================
// Weekly Hour Goal
// ============================================================

export function getWeeklyHourGoal(): number {
  return appData.weeklyHourGoal || 40;
}

export function setWeeklyHourGoal(hours: number): void {
  appData.weeklyHourGoal = hours;
  saveAppData(appData).catch(console.error);
  notify();
}

export function getCurrentWeekTotalHours(): number {
  const week = getCurrentWeekData();
  return week.blocks.length * (SLOT_MINUTES / 60);
}

// ============================================================
// Project CRUD
// ============================================================

export function getProjects(): Project[] {
  return appData.projects;
}

export function getProjectById(id: string): Project | undefined {
  return appData.projects.find((p) => p.id === id);
}

export function addProject(
  name: string,
  weeklyHourTarget: number,
  priority: "High" | "Medium" | "Low"
): Project {
  // Assign the next color index that isn't already used
  const usedIndices = new Set(appData.projects.map((p) => p.colorIndex));
  let colorIndex = 0;
  while (usedIndices.has(colorIndex) && colorIndex < PROJECT_PALETTE.length) {
    colorIndex++;
  }
  // If all colors used, cycle back
  if (colorIndex >= PROJECT_PALETTE.length) {
    colorIndex = appData.projects.length % PROJECT_PALETTE.length;
  }

  const project: Project = {
    id: generateId(),
    name,
    weeklyHourTarget,
    priority,
    colorIndex,
  };
  appData.projects.push(project);
  saveProjects(appData.projects).catch(console.error);
  notify();
  return project;
}

export function updateProject(
  id: string,
  updates: Partial<Omit<Project, "id">>
): void {
  const project = appData.projects.find((p) => p.id === id);
  if (project) {
    Object.assign(project, updates);
    saveProjects(appData.projects).catch(console.error);
    notify();
  }
}

export function deleteProject(id: string): void {
  appData.projects = appData.projects.filter((p) => p.id !== id);
  // Remove all time blocks for this project across all weeks
  for (const week of appData.weeks) {
    week.blocks = week.blocks.filter((b) => b.projectId !== id);
  }
  saveProjects(appData.projects).catch(console.error);
  // Save all affected weeks
  for (const week of appData.weeks) {
    saveWeek(week).catch(console.error);
  }
  notify();
}

// ============================================================
// Time Block Operations
// ============================================================

export function addTimeBlock(
  projectId: string,
  day: DayOfWeek,
  slotIndex: number
): TimeBlock | null {
  const week = getCurrentWeekData();
  // Check if slot is already occupied
  const existing = week.blocks.find(
    (b) => b.day === day && b.slotIndex === slotIndex
  );
  if (existing) return null;

  const block: TimeBlock = {
    id: generateId(),
    projectId,
    day,
    slotIndex,
  };
  week.blocks.push(block);
  updateWeekInState(week);
  debouncedSaveWeek();
  notify();
  return block;
}

export function addTimeBlocks(
  projectId: string,
  day: DayOfWeek,
  startSlot: number,
  endSlot: number
): TimeBlock[] {
  const week = getCurrentWeekData();
  const newBlocks: TimeBlock[] = [];
  const minSlot = Math.min(startSlot, endSlot);
  const maxSlot = Math.max(startSlot, endSlot);

  for (let slot = minSlot; slot <= maxSlot; slot++) {
    // Remove any existing block in this slot
    week.blocks = week.blocks.filter(
      (b) => !(b.day === day && b.slotIndex === slot)
    );
    const block: TimeBlock = {
      id: generateId(),
      projectId,
      day,
      slotIndex: slot,
    };
    week.blocks.push(block);
    newBlocks.push(block);
  }

  if (newBlocks.length > 0) {
    updateWeekInState(week);
    debouncedSaveWeek();
    notify();
  }
  return newBlocks;
}

export function removeTimeBlocksInRange(
  day: DayOfWeek,
  startSlot: number,
  endSlot: number
): void {
  const week = getCurrentWeekData();
  const minSlot = Math.min(startSlot, endSlot);
  const maxSlot = Math.max(startSlot, endSlot);
  const before = week.blocks.length;

  week.blocks = week.blocks.filter(
    (b) => !(b.day === day && b.slotIndex >= minSlot && b.slotIndex <= maxSlot)
  );

  if (week.blocks.length !== before) {
    updateWeekInState(week);
    debouncedSaveWeek();
    notify();
  }
}

export function removeTimeBlock(blockId: string): void {
  const week = getCurrentWeekData();
  week.blocks = week.blocks.filter((b) => b.id !== blockId);
  updateWeekInState(week);
  debouncedSaveWeek();
  notify();
}

export function updateTimeBlockProject(
  blockId: string,
  newProjectId: string
): void {
  const week = getCurrentWeekData();
  const block = week.blocks.find((b) => b.id === blockId);
  if (block) {
    block.projectId = newProjectId;
    updateWeekInState(week);
    debouncedSaveWeek();
    notify();
  }
}

function updateWeekInState(week: WeekData): void {
  const idx = appData.weeks.findIndex((w) => w.weekKey === week.weekKey);
  if (idx >= 0) {
    appData.weeks[idx] = week;
  } else {
    appData.weeks.push(week);
  }
}

// ============================================================
// Rolling Balance Calculations
// ============================================================

export function calculateProjectBalances(): ProjectBalance[] {
  const currentKey = getWeekKey(currentMonday);

  // Sort weeks chronologically
  const sortedWeeks = [...appData.weeks].sort((a, b) =>
    a.weekKey.localeCompare(b.weekKey)
  );

  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

  const balances = appData.projects.map((project) => {
    let carryover = 0;

    // Calculate carryover from all previous weeks (skip completely empty weeks)
    for (const week of sortedWeeks) {
      if (week.weekKey >= currentKey) break;
      if (week.blocks.length === 0) continue;
      const hoursLogged =
        week.blocks.filter((b) => b.projectId === project.id).length *
        (SLOT_MINUTES / 60);
      carryover += project.weeklyHourTarget - hoursLogged;
    }

    // Current week hours
    const currentWeek = getCurrentWeekData();
    const currentHours =
      currentWeek.blocks.filter((b) => b.projectId === project.id).length *
      (SLOT_MINUTES / 60);

    const effectiveAvailable = project.weeklyHourTarget + carryover;
    const percentComplete =
      effectiveAvailable > 0
        ? Math.round((currentHours / effectiveAvailable) * 100)
        : currentHours > 0
          ? 100
          : 0;

    // Calculate weekly standing (compare logged vs weekly target)
    const tolerance = Math.max(0.5, project.weeklyHourTarget * 0.10);
    let standing: WeeklyStanding;

    if (project.weeklyHourTarget === 0) {
      standing = "on-track";
    } else if (currentHours > project.weeklyHourTarget + tolerance) {
      standing = "over";
    } else if (currentHours < project.weeklyHourTarget - tolerance) {
      standing = "under";
    } else {
      standing = "on-track";
    }

    return {
      project,
      weeklyTarget: project.weeklyHourTarget,
      currentWeekLogged: currentHours,
      carryoverBalance: carryover,
      effectiveAvailable,
      percentComplete: Math.min(percentComplete, 100),
      standing,
    };
  });

  // Sort by priority: High first, then Medium, then Low
  balances.sort((a, b) =>
    (priorityOrder[a.project.priority] ?? 2) - (priorityOrder[b.project.priority] ?? 2)
  );

  return balances;
}

// ============================================================
// Templates
// ============================================================

export function getTemplates(): Template[] {
  return appData.templates;
}

export function saveCurrentWeekAsTemplate(name: string): Template {
  const week = getCurrentWeekData();
  const template: Template = {
    id: generateId(),
    name,
    blocks: week.blocks.map((b) => ({
      projectId: b.projectId,
      day: b.day,
      slotIndex: b.slotIndex,
    })),
  };
  appData.templates.push(template);
  saveTemplates(appData.templates).catch(console.error);
  notify();
  return template;
}

export function applyTemplate(templateId: string): void {
  const template = appData.templates.find((t) => t.id === templateId);
  if (!template) return;

  const week = getCurrentWeekData();
  // Clear existing blocks
  week.blocks = [];

  // Apply template blocks (only for projects that still exist)
  for (const tb of template.blocks) {
    if (appData.projects.find((p) => p.id === tb.projectId)) {
      week.blocks.push({
        id: generateId(),
        projectId: tb.projectId,
        day: tb.day as DayOfWeek,
        slotIndex: tb.slotIndex,
      });
    }
  }

  updateWeekInState(week);
  debouncedSaveWeek();
  notify();
}

export function deleteTemplate(templateId: string): void {
  appData.templates = appData.templates.filter((t) => t.id !== templateId);
  saveTemplates(appData.templates).catch(console.error);
  notify();
}
