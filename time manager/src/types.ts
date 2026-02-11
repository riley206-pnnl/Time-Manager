// ============================================================
// Time Manager - Type Definitions
// ============================================================

export type Priority = "High" | "Medium" | "Low";

export type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";

export const DAYS: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Each project gets a unique color from this palette.
// Priority only affects sort order in the sidebar.
export interface ProjectColor {
  bg: string;      // light background for blocks
  border: string;  // left-border accent
  text: string;    // text color on blocks
}

export const PROJECT_PALETTE: ProjectColor[] = [
  { bg: "#a8d8ea", border: "#2980b9", text: "#1a5276" }, // blue
  { bg: "#f8b4b4", border: "#c0392b", text: "#922b21" }, // red
  { bg: "#b8e6c8", border: "#27ae60", text: "#1e8449" }, // green
  { bg: "#f5d5a0", border: "#d4a017", text: "#7d6608" }, // gold
  { bg: "#d4b8e8", border: "#8e44ad", text: "#6c3483" }, // purple
  { bg: "#f8c8a0", border: "#e67e22", text: "#a04000" }, // orange
  { bg: "#a8e8e0", border: "#16a085", text: "#0e6655" }, // teal
  { bg: "#f0b8d0", border: "#c2185b", text: "#880e4f" }, // pink
  { bg: "#c8d8a8", border: "#689f38", text: "#33691e" }, // olive
  { bg: "#b8c8e8", border: "#3f51b5", text: "#283593" }, // indigo
  { bg: "#e8c8a8", border: "#8d6e63", text: "#4e342e" }, // brown
  { bg: "#c8e8f0", border: "#0097a7", text: "#006064" }, // cyan
];

export function getProjectColor(colorIndex: number): ProjectColor {
  return PROJECT_PALETTE[colorIndex % PROJECT_PALETTE.length];
}

// Time slots from 7:00 AM to 7:00 PM in 30-min increments
export const START_HOUR = 7;
export const END_HOUR = 19;
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (END_HOUR - START_HOUR) * (60 / SLOT_MINUTES); // 24

export interface Project {
  id: string;
  name: string;
  weeklyHourTarget: number;
  priority: Priority;
  colorIndex: number;
}

export interface TimeBlock {
  id: string;
  projectId: string;
  day: DayOfWeek;
  slotIndex: number; // 0-23, representing 7:00-7:30 through 18:30-19:00
}

export interface WeekData {
  weekKey: string; // ISO week identifier e.g. "2026-W07"
  startDate: string; // Monday's date ISO string e.g. "2026-02-09"
  blocks: TimeBlock[];
}

export interface Template {
  id: string;
  name: string;
  blocks: Omit<TimeBlock, "id">[]; // blocks without IDs, will be generated on apply
}

export interface AppData {
  projects: Project[];
  weeks: WeekData[];
  templates: Template[];
  weeklyHourGoal: number; // Default 40
}

export interface ProjectBalance {
  project: Project;
  weeklyTarget: number;
  currentWeekLogged: number;
  carryoverBalance: number;
  effectiveAvailable: number;
  percentComplete: number;
}

// Helper to format slot index to time string
export function slotToTime(slotIndex: number): string {
  const totalMinutes = (START_HOUR * 60) + (slotIndex * SLOT_MINUTES);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

// Generate a unique ID
export function generateId(): string {
  return crypto.randomUUID();
}

// Get the Monday of the week containing the given date
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Get ISO week key like "2026-W07"
export function getWeekKey(monday: Date): string {
  const year = monday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((monday.getTime() - jan1.getTime()) / 86400000);
  const weekNum = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${year}-W${weekNum.toString().padStart(2, "0")}`;
}

// Format date range for display
export function formatWeekRange(monday: Date): string {
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yearOpts: Intl.DateTimeFormatOptions = { ...opts, year: "numeric" };
  return `${monday.toLocaleDateString("en-US", opts)} – ${friday.toLocaleDateString("en-US", yearOpts)}`;
}

// Format date as ISO string (date only)
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}
