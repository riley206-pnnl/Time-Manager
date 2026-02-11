import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppData, Project, WeekData, Template } from "./types";

export async function loadAppData(): Promise<AppData> {
  return invoke<AppData>("load_app_data");
}

export async function saveAppData(data: AppData): Promise<void> {
  return invoke("save_app_data", { data });
}

export async function saveProjects(projects: Project[]): Promise<void> {
  return invoke("save_projects", { projects });
}

export async function saveWeek(week: WeekData): Promise<void> {
  return invoke("save_week", { week });
}

export async function saveTemplates(templates: Template[]): Promise<void> {
  return invoke("save_templates", { templates });
}

export async function getDataLocation(): Promise<string> {
  return invoke<string>("get_data_location");
}

export async function openFolderPicker(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select Data Folder",
  });
  return selected;
}

export async function setDataLocation(newPath: string, copyExisting: boolean): Promise<void> {
  return invoke("set_data_location", { newPath, copyExisting });
}

export async function resetToDefaultLocation(copyExisting: boolean): Promise<void> {
  return invoke("reset_to_default_location", { copyExisting });
}
