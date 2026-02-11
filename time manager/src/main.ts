import {
  DAYS,
  SLOTS_PER_DAY,
  SLOT_MINUTES,
  slotToTime,
  formatWeekRange,
  getProjectColor,
  type DayOfWeek,
  type Priority,
  type TimeBlock,
} from "./types";

import {
  initState,
  subscribe,
  getCurrentMonday,
  getCurrentWeekData,
  getProjects,
  getProjectById,
  addProject,
  updateProject,
  deleteProject,
  addTimeBlock,
  addTimeBlocks,
  removeTimeBlock,
  removeTimeBlocksInRange,
  updateTimeBlockProject,
  navigateWeek,
  goToToday,
  calculateProjectBalances,
  getTemplates,
  saveCurrentWeekAsTemplate,
  applyTemplate,
  deleteTemplate,
  getWeeklyHourGoal,
  setWeeklyHourGoal,
  getCurrentWeekTotalHours,
} from "./state";

import {
  getDataLocation,
  openFolderPicker,
  setDataLocation,
  resetToDefaultLocation,
} from "./storage";

// ============================================================
// DOM References
// ============================================================

const weekLabel = document.getElementById("week-label")!;
const calendarGrid = document.getElementById("calendar-grid")!;
const projectSummaryList = document.getElementById("project-summary-list")!;
const projectModal = document.getElementById("project-modal")!;
const projectForm = document.getElementById("project-form") as HTMLFormElement;
const projectModalTitle = document.getElementById("project-modal-title")!;
const projectNameInput = document.getElementById("project-name") as HTMLInputElement;
const projectHoursInput = document.getElementById("project-hours") as HTMLInputElement;
const projectPriorityInput = document.getElementById("project-priority") as HTMLSelectElement;
const projectListManage = document.getElementById("project-list-manage")!;
const projectListSection = document.getElementById("project-list-section")!;
const projectSelector = document.getElementById("project-selector")!;
const projectSelectorList = document.getElementById("project-selector-list")!;
const contextMenu = document.getElementById("context-menu")!;
const templateModal = document.getElementById("template-modal")!;
const templateList = document.getElementById("template-list")!;
const templateNameInput = document.getElementById("template-name") as HTMLInputElement;
const dragIndicator = document.getElementById("drag-indicator")!;
const weeklyHoursText = document.getElementById("weekly-hours-text")!;
const weeklyPercentage = document.getElementById("weekly-percentage")!;
const weeklyProgressBar = document.getElementById("weekly-progress-bar")!;
const settingsModal = document.getElementById("settings-modal")!;
const currentDataLocation = document.getElementById("current-data-location")!;
const copyDataCheckbox = document.getElementById("copy-data-checkbox") as HTMLInputElement;

// ============================================================
// State for UI interactions
// ============================================================

let editingProjectId: string | null = null;
let isDragging = false;
let dragDay: DayOfWeek | null = null;
let dragStartSlot: number | null = null;
let dragCurrentSlot: number | null = null;
let contextBlockId: string | null = null;

// Pending selection: cells waiting for project assignment after click or drag
let pendingSelection: { day: DayOfWeek; startSlot: number; endSlot: number } | null = null;

// Flag to prevent the click event (which fires right after mouseup) from
// immediately dismissing the project selector that mouseup just opened.
let suppressNextClick = false;

// Track mouse position for the drag duration indicator
let lastMouseX = 0;
let lastMouseY = 0;

// ============================================================
// Initialization
// ============================================================

window.addEventListener("DOMContentLoaded", async () => {
  await initState();
  subscribe(render);

  // Week navigation
  document.getElementById("btn-prev-week")!.addEventListener("click", () => navigateWeek(-1));
  document.getElementById("btn-next-week")!.addEventListener("click", () => navigateWeek(1));
  document.getElementById("btn-today")!.addEventListener("click", () => goToToday());

  // Modal buttons
  document.getElementById("btn-settings")!.addEventListener("click", openSettingsModal);
  document.getElementById("btn-manage-projects")!.addEventListener("click", openProjectModal);
  document.getElementById("btn-cancel-project")!.addEventListener("click", closeProjectForm);
  document.getElementById("btn-add-project")!.addEventListener("click", () => showProjectForm());
  document.getElementById("btn-templates")!.addEventListener("click", openTemplateModal);
  document.getElementById("btn-close-templates")!.addEventListener("click", closeTemplateModal);
  document.getElementById("btn-save-template")!.addEventListener("click", handleSaveTemplate);
  document.getElementById("btn-set-goal")!.addEventListener("click", handleSetWeeklyGoal);
  document.getElementById("btn-close-settings")!.addEventListener("click", closeSettingsModal);
  document.getElementById("btn-change-location")!.addEventListener("click", handleChangeLocation);
  document.getElementById("btn-reset-location")!.addEventListener("click", handleResetLocation);

  // Modal backdrops close modals
  projectModal.querySelector(".modal-backdrop")!.addEventListener("click", closeProjectModal);
  templateModal.querySelector(".modal-backdrop")!.addEventListener("click", closeTemplateModal);
  settingsModal.querySelector(".modal-backdrop")!.addEventListener("click", closeSettingsModal);

  // Project form submit
  projectForm.addEventListener("submit", handleProjectSubmit);

  // Close floating elements on outside click
  document.addEventListener("click", (e) => {
    // After a drag-mouseup opens the selector, a click event fires immediately.
    // Skip that one click so the selector stays open.
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const target = e.target as HTMLElement;
    if (!projectSelector.contains(target) && !target.closest(".cal-cell")) {
      hideProjectSelector();
    }
    if (!contextMenu.contains(target)) {
      hideContextMenu();
    }
  });

  // Close floating elements on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideProjectSelector();
      hideContextMenu();
      closeProjectModal();
      closeTemplateModal();
      closeSettingsModal();
    }
  });

  // Track mouse position for drag indicator
  document.addEventListener("mousemove", (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (isDragging) {
      updateDragIndicatorPosition();
    }
  });

  // Global mouseup to finalize drag selection and show project selector
  document.addEventListener("mouseup", (e) => {
    if (!isDragging) return;
    if (dragDay === null || dragStartSlot === null || dragCurrentSlot === null) {
      isDragging = false;
      hideDragIndicator();
      return;
    }

    const selectedDay = dragDay;
    const startSlot = dragStartSlot;
    const endSlot = dragCurrentSlot;

    isDragging = false;
    dragDay = null;
    dragStartSlot = null;
    dragCurrentSlot = null;
    clearSelectionHighlight();
    hideDragIndicator();

    // Show project selector for the dragged range.
    // Set flag so the click event that fires right after mouseup
    // doesn't immediately dismiss the selector.
    suppressNextClick = true;
    pendingSelection = { day: selectedDay, startSlot, endSlot };
    showProjectSelector(e as MouseEvent);
  });

  render();
});

// ============================================================
// Render
// ============================================================

function render(): void {
  renderWeekLabel();
  renderWeeklyProgress();
  renderCalendar();
  renderSidebar();
}

function renderWeekLabel(): void {
  const monday = getCurrentMonday();
  weekLabel.textContent = formatWeekRange(monday);
}

function renderWeeklyProgress(): void {
  const totalHours = getCurrentWeekTotalHours();
  const goalHours = getWeeklyHourGoal();
  const percentage = Math.min(100, Math.round((totalHours / goalHours) * 100));

  weeklyHoursText.textContent = `${totalHours} / ${goalHours} hrs`;
  weeklyPercentage.textContent = `${percentage}%`;
  weeklyProgressBar.style.width = `${percentage}%`;
}

// ============================================================
// Calendar Rendering
// ============================================================

function renderCalendar(): void {
  calendarGrid.innerHTML = "";
  const monday = getCurrentMonday();
  const weekData = getCurrentWeekData();

  // Header row
  const timeHeader = document.createElement("div");
  timeHeader.className = "cal-header";
  timeHeader.textContent = "";
  calendarGrid.appendChild(timeHeader);

  DAYS.forEach((day, i) => {
    const header = document.createElement("div");
    header.className = "cal-header";
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    header.innerHTML = `<div class="cal-header-day">
      <span>${day.substring(0, 3)}</span>
      <span class="date">${dayDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
    </div>`;
    calendarGrid.appendChild(header);
  });

  // Pre-compute contiguous block groups for time display
  const blockGroupSizes = computeBlockGroupSizes(weekData.blocks);

  // Time rows
  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    const isHourStart = slot % 2 === 0;

    // Time label
    const timeCell = document.createElement("div");
    timeCell.className = `cal-time${isHourStart ? " hour-start" : ""}`;
    timeCell.textContent = isHourStart ? slotToTime(slot) : "";
    calendarGrid.appendChild(timeCell);

    // Day cells
    DAYS.forEach((day) => {
      const cell = document.createElement("div");
      cell.className = `cal-cell${isHourStart ? " hour-start" : ""}`;
      cell.dataset.day = day;
      cell.dataset.slot = String(slot);

      // Find block for this cell
      const block = weekData.blocks.find(
        (b) => b.day === day && b.slotIndex === slot
      );

      if (block) {
        const project = getProjectById(block.projectId);
        if (project) {
          const pColor = getProjectColor(project.colorIndex);
          const blockEl = document.createElement("div");
          blockEl.className = "time-block";
          blockEl.style.background = pColor.bg;
          blockEl.style.color = pColor.text;
          blockEl.style.borderLeft = `3px solid ${pColor.border}`;
          blockEl.dataset.blockId = block.id;

          // Check for merged blocks (same project in adjacent slots)
          const prevBlock = weekData.blocks.find(
            (b) => b.day === day && b.slotIndex === slot - 1 && b.projectId === block.projectId
          );
          const nextBlock = weekData.blocks.find(
            (b) => b.day === day && b.slotIndex === slot + 1 && b.projectId === block.projectId
          );

          if (prevBlock && nextBlock) {
            blockEl.classList.add("merged-middle");
          } else if (prevBlock) {
            blockEl.classList.add("merged-bottom");
          } else if (nextBlock) {
            blockEl.classList.add("merged-top");
          }

          // Build label text: show project name + duration on the first block of a group
          const groupKey = `${day}:${block.projectId}:${slot}`;
          const groupSize = blockGroupSizes.get(groupKey);
          const label = document.createElement("span");
          label.className = "block-label";
          if (groupSize !== undefined) {
            // This is the first block of a contiguous group
            const hours = (groupSize * SLOT_MINUTES) / 60;
            const timeStr = hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
            label.textContent = `${project.name} - ${timeStr}`;
          } else if (!prevBlock) {
            // Standalone single block
            const timeStr = `${SLOT_MINUTES}m`;
            label.textContent = `${project.name} - ${timeStr}`;
          } else {
            label.textContent = project.name;
          }
          blockEl.appendChild(label);

          // Right-click on block
          blockEl.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, block.id);
          });

          // Click on block - stop propagation to prevent cell handler
          blockEl.addEventListener("click", (e) => {
            e.stopPropagation();
          });

          cell.appendChild(blockEl);
        }
      }

      // Mouse events for drag selection and click-to-assign
      cell.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return; // left click only

        isDragging = true;
        dragDay = day;
        dragStartSlot = slot;
        dragCurrentSlot = slot;
        updateSelectionHighlight();
      });

      cell.addEventListener("mouseenter", () => {
        if (isDragging && dragDay === day) {
          dragCurrentSlot = slot;
          updateSelectionHighlight();
        }
      });

      // Prevent context menu on empty cells
      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });

      calendarGrid.appendChild(cell);
    });
  }
}

// Compute the size of each contiguous group of same-project blocks per day.
// Returns a map where the key is "day:projectId:firstSlot" and value is the group size.
function computeBlockGroupSizes(blocks: TimeBlock[]): Map<string, number> {
  const result = new Map<string, number>();

  for (const day of DAYS) {
    // Get blocks for this day, sorted by slot index
    const dayBlocks = blocks
      .filter((b) => b.day === day)
      .sort((a, b) => a.slotIndex - b.slotIndex);

    let i = 0;
    while (i < dayBlocks.length) {
      const startBlock = dayBlocks[i];
      let groupSize = 1;

      // Count contiguous blocks with the same project
      while (
        i + groupSize < dayBlocks.length &&
        dayBlocks[i + groupSize].projectId === startBlock.projectId &&
        dayBlocks[i + groupSize].slotIndex === startBlock.slotIndex + groupSize
      ) {
        groupSize++;
      }

      // Only store if it's a group (will show duration on first block)
      const key = `${day}:${startBlock.projectId}:${startBlock.slotIndex}`;
      result.set(key, groupSize);

      i += groupSize;
    }
  }

  return result;
}

function updateSelectionHighlight(): void {
  clearSelectionHighlight();

  if (!isDragging || dragDay === null || dragStartSlot === null || dragCurrentSlot === null) {
    hideDragIndicator();
    return;
  }

  const minSlot = Math.min(dragStartSlot, dragCurrentSlot);
  const maxSlot = Math.max(dragStartSlot, dragCurrentSlot);
  const slotCount = maxSlot - minSlot + 1;

  const cells = calendarGrid.querySelectorAll<HTMLElement>(".cal-cell");
  cells.forEach((cell) => {
    if (
      cell.dataset.day === dragDay &&
      Number(cell.dataset.slot) >= minSlot &&
      Number(cell.dataset.slot) <= maxSlot
    ) {
      cell.classList.add("selecting");
    }
  });

  // Update drag indicator with duration
  const totalMinutes = slotCount * SLOT_MINUTES;
  const hours = totalMinutes / 60;
  let durationText: string;
  if (totalMinutes < 60) {
    durationText = `${totalMinutes} min`;
  } else if (hours % 1 === 0) {
    durationText = `${hours} hr${hours !== 1 ? "s" : ""}`;
  } else {
    durationText = `${hours.toFixed(1)} hrs`;
  }

  const startTime = slotToTime(minSlot);
  const endTime = slotToTime(maxSlot + 1); // +1 because end is exclusive
  dragIndicator.textContent = `${startTime} – ${endTime}  (${durationText})`;
  dragIndicator.classList.remove("hidden");
  updateDragIndicatorPosition();
}

function updateDragIndicatorPosition(): void {
  dragIndicator.style.left = `${lastMouseX + 16}px`;
  dragIndicator.style.top = `${lastMouseY - 12}px`;
}

function hideDragIndicator(): void {
  dragIndicator.classList.add("hidden");
}

function clearSelectionHighlight(): void {
  calendarGrid.querySelectorAll(".selecting").forEach((el) => el.classList.remove("selecting"));
}

// ============================================================
// Project Selector (floating dropdown for assigning blocks)
// ============================================================

function showProjectSelector(e: MouseEvent): void {
  const projects = getProjects();
  if (projects.length === 0 && !pendingSelection) {
    pendingSelection = null;
    return;
  }

  projectSelectorList.innerHTML = "";

  // Check if there are existing blocks in the selected range
  if (pendingSelection) {
    const weekData = getCurrentWeekData();
    const minSlot = Math.min(pendingSelection.startSlot, pendingSelection.endSlot);
    const maxSlot = Math.max(pendingSelection.startSlot, pendingSelection.endSlot);
    const existingBlocks = weekData.blocks.filter(
      (b) => b.day === pendingSelection!.day && b.slotIndex >= minSlot && b.slotIndex <= maxSlot
    );

    if (existingBlocks.length > 0) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "project-selector-item project-selector-delete";
      const count = existingBlocks.length;
      const hrs = (count * SLOT_MINUTES) / 60;
      const hrsStr = hrs % 1 === 0 ? `${hrs}` : hrs.toFixed(1);
      deleteBtn.innerHTML = `
        <span class="priority-dot" style="background: var(--danger); border: 2px solid var(--danger-hover)"></span>
        <span>Delete blocks (${hrsStr} hrs)</span>
      `;
      deleteBtn.addEventListener("click", () => {
        if (pendingSelection) {
          removeTimeBlocksInRange(pendingSelection.day, pendingSelection.startSlot, pendingSelection.endSlot);
          pendingSelection = null;
        }
        hideProjectSelector();
      });
      projectSelectorList.appendChild(deleteBtn);
    }
  }

  if (projects.length === 0) {
    pendingSelection = null;
    return;
  }

  projects.forEach((project) => {
    const pColor = getProjectColor(project.colorIndex);
    const item = document.createElement("button");
    item.className = "project-selector-item";
    item.innerHTML = `
      <span class="priority-dot" style="background: ${pColor.bg}; border: 2px solid ${pColor.border}"></span>
      <span>${project.name}</span>
    `;
    item.addEventListener("click", () => {
      if (pendingSelection) {
        addTimeBlocks(
          project.id,
          pendingSelection.day,
          pendingSelection.startSlot,
          pendingSelection.endSlot
        );
        pendingSelection = null;
      }
      hideProjectSelector();
    });
    projectSelectorList.appendChild(item);
  });

  // Position near click
  projectSelector.classList.remove("hidden");
  // Wait a frame so we can measure
  requestAnimationFrame(() => {
    const rect = projectSelector.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;

    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;

    projectSelector.style.left = `${x}px`;
    projectSelector.style.top = `${y}px`;
  });
}

function hideProjectSelector(): void {
  projectSelector.classList.add("hidden");
  pendingSelection = null;
}

// ============================================================
// Context Menu (right-click on block)
// ============================================================

function showContextMenu(e: MouseEvent, blockId: string): void {
  contextBlockId = blockId;
  contextMenu.classList.remove("hidden");

  let x = e.clientX;
  let y = e.clientY;

  requestAnimationFrame(() => {
    const rect = contextMenu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
  });

  // Wire up actions
  document.getElementById("ctx-edit")!.onclick = () => {
    hideContextMenu();
    showProjectSelectorForEdit(e, blockId);
  };

  document.getElementById("ctx-delete")!.onclick = () => {
    if (contextBlockId) {
      removeTimeBlock(contextBlockId);
    }
    hideContextMenu();
  };
}

function hideContextMenu(): void {
  contextMenu.classList.add("hidden");
  contextBlockId = null;
}

function showProjectSelectorForEdit(e: MouseEvent, blockId: string): void {
  const projects = getProjects();
  projectSelectorList.innerHTML = "";
  projects.forEach((project) => {
    const pColor = getProjectColor(project.colorIndex);
    const item = document.createElement("button");
    item.className = "project-selector-item";
    item.innerHTML = `
      <span class="priority-dot" style="background: ${pColor.bg}; border: 2px solid ${pColor.border}"></span>
      <span>${project.name}</span>
    `;
    item.addEventListener("click", () => {
      updateTimeBlockProject(blockId, project.id);
      hideProjectSelector();
    });
    projectSelectorList.appendChild(item);
  });

  projectSelector.classList.remove("hidden");
  requestAnimationFrame(() => {
    const rect = projectSelector.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    projectSelector.style.left = `${x}px`;
    projectSelector.style.top = `${y}px`;
  });
}

// ============================================================
// Sidebar - Project Summary
// ============================================================

function renderSidebar(): void {
  const balances = calculateProjectBalances();

  if (balances.length === 0) {
    projectSummaryList.innerHTML = '<div class="empty-state">No projects yet. Click "Projects" to add some.</div>';
    return;
  }

  projectSummaryList.innerHTML = "";
  balances.forEach((bal) => {
    const pColor = getProjectColor(bal.project.colorIndex);
    const card = document.createElement("div");
    card.className = "project-card";
    card.style.borderLeftColor = pColor.border;

    const carryoverClass =
      bal.carryoverBalance > 0
        ? "carryover-positive"
        : bal.carryoverBalance < 0
          ? "carryover-negative"
          : "carryover-zero";

    const carryoverText =
      bal.carryoverBalance > 0
        ? `+${bal.carryoverBalance.toFixed(1)} carry forward`
        : bal.carryoverBalance < 0
          ? `${bal.carryoverBalance.toFixed(1)} behind`
          : "0 carryover";

    card.innerHTML = `
      <div class="project-card-header">
        <span class="project-card-name">${bal.project.name}</span>
        <span class="project-card-priority" style="background: ${pColor.border}">${bal.project.priority}</span>
      </div>
      <div class="project-card-stats">
        Target: <strong>${bal.weeklyTarget} hrs/week</strong><br/>
        Logged: <strong>${bal.currentWeekLogged.toFixed(1)} hrs</strong> this week<br/>
        Carryover: <span class="${carryoverClass}"><strong>${carryoverText}</strong></span><br/>
        Effective: <strong>${bal.effectiveAvailable.toFixed(1)} hrs</strong> available
      </div>
      <div class="project-card-bar">
        <div class="project-card-bar-fill" style="width: ${bal.percentComplete}%; background: ${pColor.border}"></div>
      </div>
    `;

    projectSummaryList.appendChild(card);
  });
}

// ============================================================
// Project Modal
// ============================================================

function openProjectModal(): void {
  projectModal.classList.remove("hidden");
  hideProjectForm();
  renderProjectList();
}

function closeProjectModal(): void {
  projectModal.classList.add("hidden");
  editingProjectId = null;
}

function showProjectForm(editId?: string): void {
  projectForm.classList.remove("hidden");
  projectListSection.style.display = "none";

  if (typeof editId === "string") {
    editingProjectId = editId;
    const project = getProjectById(editId);
    if (project) {
      projectModalTitle.textContent = "Edit Project";
      projectNameInput.value = project.name;
      projectHoursInput.value = String(project.weeklyHourTarget);
      projectPriorityInput.value = project.priority;
    }
  } else {
    editingProjectId = null;
    projectModalTitle.textContent = "Add Project";
    projectNameInput.value = "";
    projectHoursInput.value = "";
    projectPriorityInput.value = "Medium";
  }
  projectNameInput.focus();
}

function hideProjectForm(): void {
  projectForm.classList.add("hidden");
  projectListSection.style.display = "";
  editingProjectId = null;
}

function closeProjectForm(): void {
  hideProjectForm();
  renderProjectList();
}

function handleProjectSubmit(e: Event): void {
  e.preventDefault();
  const name = projectNameInput.value.trim();
  const hours = parseFloat(projectHoursInput.value);
  const priority = projectPriorityInput.value as Priority;

  if (!name || isNaN(hours) || hours <= 0) return;

  if (editingProjectId) {
    updateProject(editingProjectId, { name, weeklyHourTarget: hours, priority });
  } else {
    addProject(name, hours, priority);
  }

  hideProjectForm();
  renderProjectList();
}

function renderProjectList(): void {
  const projects = getProjects();
  projectListManage.innerHTML = "";

  if (projects.length === 0) {
    projectListManage.innerHTML = '<div class="empty-state">No projects yet.</div>';
    return;
  }

  projects.forEach((project) => {
    const pColor = getProjectColor(project.colorIndex);
    const item = document.createElement("div");
    item.className = "project-list-item";
    item.innerHTML = `
      <div class="project-info">
        <span class="priority-dot" style="background: ${pColor.border}"></span>
        <span>${project.name} (${project.weeklyHourTarget}h, ${project.priority})</span>
      </div>
      <div class="project-actions">
        <button class="btn-secondary btn-sm edit-btn">Edit</button>
        <button class="btn-danger btn-sm delete-btn">Delete</button>
      </div>
    `;
    item.querySelector(".edit-btn")!.addEventListener("click", () => showProjectForm(project.id));
    item.querySelector(".delete-btn")!.addEventListener("click", () => {
      if (confirm(`Delete project "${project.name}"? This will remove all its time blocks.`)) {
        deleteProject(project.id);
        renderProjectList();
      }
    });
    projectListManage.appendChild(item);
  });
}

// ============================================================
// Template Modal
// ============================================================

function openTemplateModal(): void {
  templateModal.classList.remove("hidden");
  renderTemplateList();
}

function closeTemplateModal(): void {
  templateModal.classList.add("hidden");
}

function renderTemplateList(): void {
  const templates = getTemplates();
  templateList.innerHTML = "";

  if (templates.length === 0) {
    templateList.innerHTML = '<div class="empty-state">No templates saved.</div>';
    return;
  }

  templates.forEach((template) => {
    const item = document.createElement("div");
    item.className = "template-item";
    item.innerHTML = `
      <span class="template-info">${template.name} (${template.blocks.length} blocks)</span>
      <div class="template-actions">
        <button class="btn-primary btn-sm apply-btn">Apply</button>
        <button class="btn-danger btn-sm delete-btn">Delete</button>
      </div>
    `;
    item.querySelector(".apply-btn")!.addEventListener("click", () => {
      if (confirm(`Apply template "${template.name}"? This will replace all blocks in the current week.`)) {
        applyTemplate(template.id);
        closeTemplateModal();
      }
    });
    item.querySelector(".delete-btn")!.addEventListener("click", () => {
      if (confirm(`Delete template "${template.name}"?`)) {
        deleteTemplate(template.id);
        renderTemplateList();
      }
    });
    templateList.appendChild(item);
  });
}

function handleSetWeeklyGoal(): void {
  const currentGoal = getWeeklyHourGoal();
  const input = prompt(`Enter your weekly hour goal:`, currentGoal.toString());
  if (input === null) return;
  const newGoal = parseFloat(input);
  if (isNaN(newGoal) || newGoal <= 0) {
    alert("Please enter a valid positive number.");
    return;
  }
  setWeeklyHourGoal(newGoal);
}

// ============================================================
// Settings Modal
// ============================================================

async function openSettingsModal(): Promise<void> {
  settingsModal.classList.remove("hidden");
  await loadCurrentDataLocation();
}

function closeSettingsModal(): void {
  settingsModal.classList.add("hidden");
}

async function loadCurrentDataLocation(): Promise<void> {
  try {
    const location = await getDataLocation();
    currentDataLocation.textContent = location;
  } catch (error) {
    currentDataLocation.textContent = "Error loading location";
    console.error("Failed to load data location:", error);
  }
}

async function handleChangeLocation(): Promise<void> {
  try {
    const selectedPath = await openFolderPicker();
    if (!selectedPath) return;

    const copyData = copyDataCheckbox.checked;
    await setDataLocation(selectedPath, copyData);
    
    alert("Data location changed successfully! The application will reload the data.");
    await loadCurrentDataLocation();
    
    // Re-initialize state to reload data from new location
    await initState();
  } catch (error) {
    alert(`Failed to change data location: ${error}`);
    console.error("Error changing location:", error);
  }
}

async function handleResetLocation(): Promise<void> {
  if (!confirm("Reset to default data location? Your data will be copied if the checkbox is enabled.")) {
    return;
  }

  try {
    const copyData = copyDataCheckbox.checked;
    await resetToDefaultLocation(copyData);
    
    alert("Data location reset to default successfully!");
    await loadCurrentDataLocation();
    
    // Re-initialize state to reload data from default location
    await initState();
  } catch (error) {
    alert(`Failed to reset data location: ${error}`);
    console.error("Error resetting location:", error);
  }
}

function handleSaveTemplate(): void {
  const name = templateNameInput.value.trim();
  if (!name) return;
  saveCurrentWeekAsTemplate(name);
  templateNameInput.value = "";
  renderTemplateList();
}

void addTimeBlock; // available for direct single-cell assignment
