use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

// ============================================================
// Settings (User Preferences)
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(rename = "customDataPath", skip_serializing_if = "Option::is_none")]
    pub custom_data_path: Option<String>,
}

// ============================================================
// Data Models
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChargeCodeSplit {
    pub code: String,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(rename = "weeklyHourTarget")]
    pub weekly_hour_target: f64,
    pub priority: String, // "High", "Medium", "Low"
    #[serde(rename = "colorIndex", default)]
    pub color_index: u32,
    #[serde(rename = "chargeCodeSplits", default, skip_serializing_if = "Option::is_none")]
    pub charge_code_splits: Option<Vec<ChargeCodeSplit>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeBlock {
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub day: String,
    #[serde(rename = "slotIndex")]
    pub slot_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeekData {
    #[serde(rename = "weekKey")]
    pub week_key: String,
    #[serde(rename = "startDate")]
    pub start_date: String,
    pub blocks: Vec<TimeBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateBlock {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub day: String,
    #[serde(rename = "slotIndex")]
    pub slot_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub blocks: Vec<TemplateBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppData {
    pub projects: Vec<Project>,
    pub weeks: Vec<WeekData>,
    pub templates: Vec<Template>,
    #[serde(rename = "weeklyHourGoal", default = "default_weekly_goal")]
    pub weekly_hour_goal: f64,
}

fn default_weekly_goal() -> f64 {
    40.0
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            projects: Vec::new(),
            weeks: Vec::new(),
            templates: Vec::new(),
            weekly_hour_goal: 40.0,
        }
    }
}

// ============================================================
// State Management
// ============================================================

pub struct AppState {
    pub data: Mutex<AppData>,
    pub data_path: Mutex<PathBuf>,
    pub settings: Mutex<Settings>,
    pub app_handle: tauri::AppHandle,
}

fn get_config_path(app: &tauri::AppHandle) -> PathBuf {
    let config_dir = app
        .path()
        .app_config_dir()
        .expect("Failed to get app config directory");
    fs::create_dir_all(&config_dir).expect("Failed to create app config directory");
    config_dir.join("settings.json")
}

fn load_settings(path: &PathBuf) -> Settings {
    if path.exists() {
        match fs::read_to_string(path) {
            Ok(contents) => match serde_json::from_str(&contents) {
                Ok(settings) => settings,
                Err(e) => {
                    eprintln!("Failed to parse settings file: {}", e);
                    Settings::default()
                }
            },
            Err(e) => {
                eprintln!("Failed to read settings file: {}", e);
                Settings::default()
            }
        }
    } else {
        Settings::default()
    }
}

fn save_settings_file(path: &PathBuf, settings: &Settings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_default_data_path(app: &tauri::AppHandle) -> PathBuf {
    let app_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory");
    fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
    app_dir.join("time_manager_data.json")
}

fn get_data_path(app: &tauri::AppHandle, settings: &Settings) -> PathBuf {
    if let Some(custom_path) = &settings.custom_data_path {
        let custom_dir = PathBuf::from(custom_path);
        if custom_dir.exists() && custom_dir.is_dir() {
            return custom_dir.join("time_manager_data.json");
        } else {
            eprintln!("Custom data path does not exist or is not a directory: {}", custom_path);
        }
    }
    get_default_data_path(app)
}

fn load_data(path: &PathBuf) -> AppData {
    if path.exists() {
        match fs::read_to_string(path) {
            Ok(contents) => match serde_json::from_str(&contents) {
                Ok(data) => data,
                Err(e) => {
                    eprintln!("Failed to parse data file: {}", e);
                    AppData::default()
                }
            },
            Err(e) => {
                eprintln!("Failed to read data file: {}", e);
                AppData::default()
            }
        }
    } else {
        AppData::default()
    }
}

fn save_data(path: &PathBuf, data: &AppData) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================
// Tauri Commands
// ============================================================

#[tauri::command]
fn load_app_data(state: tauri::State<'_, AppState>) -> Result<AppData, String> {
    let data = state.data.lock().map_err(|e| e.to_string())?;
    Ok(data.clone())
}

#[tauri::command]
fn save_app_data(state: tauri::State<'_, AppState>, data: AppData) -> Result<(), String> {
    let mut current = state.data.lock().map_err(|e| e.to_string())?;
    *current = data.clone();
    let data_path = state.data_path.lock().map_err(|e| e.to_string())?;
    save_data(&data_path, &data)
}

#[tauri::command]
fn save_projects(state: tauri::State<'_, AppState>, projects: Vec<Project>) -> Result<(), String> {
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    data.projects = projects;
    let data_path = state.data_path.lock().map_err(|e| e.to_string())?;
    save_data(&data_path, &data)
}

#[tauri::command]
fn save_week(state: tauri::State<'_, AppState>, week: WeekData) -> Result<(), String> {
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = data.weeks.iter_mut().find(|w| w.week_key == week.week_key) {
        *existing = week;
    } else {
        data.weeks.push(week);
    }
    let data_path = state.data_path.lock().map_err(|e| e.to_string())?;
    save_data(&data_path, &data)
}

#[tauri::command]
fn save_templates(
    state: tauri::State<'_, AppState>,
    templates: Vec<Template>,
) -> Result<(), String> {
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    data.templates = templates;
    let data_path = state.data_path.lock().map_err(|e| e.to_string())?;
    save_data(&data_path, &data)
}

#[tauri::command]
fn get_data_location(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let data_path = state.data_path.lock().map_err(|e| e.to_string())?;
    let parent = data_path
        .parent()
        .ok_or_else(|| "Failed to get parent directory".to_string())?;
    Ok(parent.to_string_lossy().to_string())
}

#[tauri::command]
async fn set_data_location(
    state: tauri::State<'_, AppState>,
    new_path: String,
    copy_existing: bool,
) -> Result<(), String> {
    let new_dir = PathBuf::from(&new_path);
    
    // Validate the new path
    if !new_dir.exists() {
        return Err(format!("Directory does not exist: {}", new_path));
    }
    if !new_dir.is_dir() {
        return Err(format!("Path is not a directory: {}", new_path));
    }
    
    // Test if directory is writable
    let test_file = new_dir.join(".test_write");
    if let Err(e) = fs::write(&test_file, "test") {
        return Err(format!("Directory is not writable: {}", e));
    }
    let _ = fs::remove_file(&test_file);
    
    let new_data_file = new_dir.join("time_manager_data.json");
    
    // Copy existing data if requested
    if copy_existing {
        let old_data_path = state.data_path.lock().map_err(|e| e.to_string())?;
        if old_data_path.exists() && !new_data_file.exists() {
            fs::copy(&*old_data_path, &new_data_file)
                .map_err(|e| format!("Failed to copy data: {}", e))?;
        }
    }
    
    // Update settings
    let config_path = get_config_path(&state.app_handle);
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    settings.custom_data_path = Some(new_path);
    save_settings_file(&config_path, &settings)?;
    
    // Update data path and reload data
    let mut data_path = state.data_path.lock().map_err(|e| e.to_string())?;
    *data_path = new_data_file.clone();
    drop(data_path);
    
    let new_data = load_data(&new_data_file);
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    *data = new_data;
    
    Ok(())
}

#[tauri::command]
async fn reset_to_default_location(
    state: tauri::State<'_, AppState>,
    copy_existing: bool,
) -> Result<(), String> {
    let default_path = get_default_data_path(&state.app_handle);
    
    // Copy existing data if requested
    if copy_existing {
        let old_data_path = state.data_path.lock().map_err(|e| e.to_string())?;
        if old_data_path.exists() && !default_path.exists() {
            if let Some(parent) = default_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            }
            fs::copy(&*old_data_path, &default_path)
                .map_err(|e| format!("Failed to copy data: {}", e))?;
        }
    }
    
    // Update settings
    let config_path = get_config_path(&state.app_handle);
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    settings.custom_data_path = None;
    save_settings_file(&config_path, &settings)?;
    
    // Update data path and reload data
    let mut data_path = state.data_path.lock().map_err(|e| e.to_string())?;
    *data_path = default_path.clone();
    drop(data_path);
    
    let new_data = load_data(&default_path);
    let mut data = state.data.lock().map_err(|e| e.to_string())?;
    *data = new_data;
    
    Ok(())
}

// ============================================================
// App Entry
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let config_path = get_config_path(&handle);
            let settings = load_settings(&config_path);
            let data_path = get_data_path(&handle, &settings);
            let data = load_data(&data_path);
            app.manage(AppState {
                data: Mutex::new(data),
                data_path: Mutex::new(data_path),
                settings: Mutex::new(settings),
                app_handle: handle,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_app_data,
            save_app_data,
            save_projects,
            save_week,
            save_templates,
            get_data_location,
            set_data_location,
            reset_to_default_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
