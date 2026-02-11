# Time Manager


https://github.com/user-attachments/assets/e750708a-359e-4683-a52a-281a1f4dd5a3


A desktop time management application for weekly project scheduling and time tracking. Built with Tauri v2 + TypeScript.

## Features

- **Weekly Calendar View** - Monday-Friday, 7 AM - 7 PM with 30-minute time slots
- **Project Management** - Create projects with weekly hour targets and priority levels
- **Time Block Scheduling** - Click-to-assign or drag-to-create time blocks
- **Rolling Balance System** - Track carryover hours across weeks
- **Weekly Hour Goal** - Set goals and track progress with visual progress bar
- **Templates** - Save and reuse weekly scheduling patterns
- **Custom Data Location** - Choose where your data is stored for cloud sync (OneDrive, Dropbox, etc.)
- **Multi-Device Sync** - Store data in a cloud-synced folder to access from multiple computers
- **Auto-save** - Changes automatically saved to local storage
- **Unique Project Colors** - Each project gets a distinct color for easy identification

## Data Storage

### Default Location

Application data is automatically saved to the OS-appropriate user data directory:
- **Windows:** `C:\Users\<username>\AppData\Roaming\com.time-manager.app\time_manager_data.json`
- **macOS:** `~/Library/Application Support/com.time-manager.app/`
- **Linux:** `~/.config/com.time-manager.app/`

Data persists across app updates and is separate from the installation directory.

### Custom Data Location (Cloud Sync)

You can change the data storage location to enable cloud synchronization across multiple devices:

1. Click **Settings** in the top-right corner
2. Click **Change Location**
3. Select a cloud-synced folder (OneDrive, Dropbox, Google Drive, etc.)
4. Choose whether to copy your existing data to the new location
5. Click **Save**

**To connect to an existing synced data location:** Select the folder where `time_manager_data.json` already exists (the same folder another computer is using).

Your data will now be stored in the selected folder and sync across all devices that access the same folder. Each computer stores its data location preference separately, so you can point multiple machines to the same cloud folder.

**Benefits:**
- Access your schedule from multiple computers
- Automatic cloud backup
- Share data with team members (via shared folders)
- Easy manual backup by copying the folder

**Note:** Settings are stored separately in the app config directory and are not synced.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://www.rust-lang.org/tools/install) (rustc, cargo)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
npm install
```

### Run Development Server

```bash
npm run tauri dev
```

This starts both the Vite development server and the Tauri desktop app with hot-reload enabled.

## Building for Production

### Build Installers

```bash
npm run tauri build
```

This creates production-ready installers in `src-tauri/target/release/bundle/`:

**Windows:**
- `msi/time-manager_0.1.0_x64_en-US.msi` - MSI installer
- `nsis/time-manager_0.1.0_x64-setup.exe` - NSIS installer

**macOS** (when built on Mac):
- `.dmg` disk image
- `.app` bundle

**Linux** (when built on Linux):
- `.deb` package (Debian/Ubuntu)
- `.AppImage` (universal Linux)
- `.rpm` package (Fedora/RedHat)

### Cross-Platform Notes

Tauri builds are platform-specific. To create installers for multiple platforms:
1. Build on each target OS separately, or
2. Use GitHub Actions for automated multi-platform builds

The same codebase works on Windows, macOS, and Linux without modifications.

## Distribution

Users can install the app by running either the `.msi` or `-setup.exe` installer. The installers:
- Install the app to Program Files
- Create Start Menu shortcuts
- Add an uninstaller
- Require no runtime dependencies (uses OS WebView2)

Installer size: ~3-10 MB

## Tech Stack

- **Frontend:** Vanilla TypeScript, HTML5, CSS3
- **Build Tool:** Vite
- **Desktop Framework:** Tauri v2
- **Backend:** Rust with serde for JSON serialization
- **UI Rendering:** Native OS WebView (WebView2 on Windows)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) 
- [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
