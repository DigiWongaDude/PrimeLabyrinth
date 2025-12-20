const labyrinthMap = {
  "223": {
    name: "P7 room (2,2,3)",
    doors: [
      { label: "Door A → 335", next: "335", note: "Twin fives hum behind this frame." },
      { label: "Door B → 277", next: "277", note: "A narrow leap through sevens." },
      { label: "Door C → 442", next: "442", note: "Composite glow, but the hinges are kind." },
    ],
  },
  "335": {
    name: "The Twin Gate (3,3,5)",
    doors: [
      { label: "Slipstream → 223", next: "223", note: "Retrace to familiar factors." },
      { label: "Archway → 557", next: "557", note: "Two fives, one seven — a confident stride." },
    ],
  },
  "277": {
    name: "The Sevens Fold (2,7,7)",
    doors: [
      { label: "Spiral → 331", next: "331", note: "A quieter, orderly chamber." },
      { label: "Return → 223", next: "223", note: "Undo the leap; breathe." },
      { label: "Cobalt Crack → 499", next: "499", note: "An echoing hollow of primes." },
    ],
  },
  "442": {
    name: "Cyan Antechamber (4,4,2)",
    doors: [
      { label: "Latch → 223", next: "223", note: "Snap back to where you began." },
    ],
  },
  "499": {
    name: "Silent Square (4,9,9)",
    doors: [
      { label: "Quiet door → 277", next: "277", note: "Retrace to the sevens." },
      { label: "Mirror → 331", next: "331", note: "Follow the ordered trio." },
    ],
  },
  "331": {
    name: "Braided Step (3,3,1)",
    doors: [
      { label: "Hook → 223", next: "223", note: "A calm return." },
      { label: "Twist → 557", next: "557", note: "Lean into the fives and a seven." },
    ],
  },
  "557": {
    name: "Shifting Fifths (5,5,7)",
    doors: [
      { label: "Doorway → 335", next: "335", note: "Back to the twins." },
      { label: "Veil → 277", next: "277", note: "Toward the sevens once more." },
    ],
  },
};

const defaultRoomCode = "223";
let breadcrumb = [defaultRoomCode];
let currentRoomCode = defaultRoomCode;

const roomNameEl = document.getElementById("roomName");
const roomCodeEl = document.getElementById("roomCode");
const doorListEl = document.getElementById("doorList");
const breadcrumbTextEl = document.getElementById("breadcrumbText");
const reverseBtn = document.getElementById("reverseBtn");
const restartBtn = document.getElementById("restartBtn");

function getRoomData(code) {
  if (labyrinthMap[code]) return labyrinthMap[code];

  const derivedDoors = createFallbackDoors(code);
  return {
    name: `Uncharted Node (${code})`,
    doors: derivedDoors,
  };
}

function createFallbackDoors(code) {
  const nums = code.split("").map((n) => Number.parseInt(n, 10));
  const base = nums.reduce((acc, n) => acc + n, 0) || 1;
  const doors = [];
  const count = Math.min(5, Math.max(1, (base % 4) + 1));

  for (let i = 0; i < count; i++) {
    const nextCode = `${(base + i + 2) % 9}${(nums[1] || 2) + i}${(nums[2] || 3) + i}`;
    doors.push({
      label: `Echo ${i + 1} → ${nextCode}`,
      next: nextCode,
      note: "Procedurally suggested path.",
    });
  }

  return doors;
}

function updateBreadcrumb() {
  breadcrumbTextEl.textContent = `../${breadcrumb.join("/")}`;
}

function renderDoors(roomData) {
  doorListEl.innerHTML = "";
  roomData.doors.slice(0, 5).forEach((door) => {
    const btn = document.createElement("button");
    btn.className = "door";
    btn.type = "button";

    const label = document.createElement("span");
    label.className = "door__label";
    label.textContent = door.label;

    const note = document.createElement("span");
    note.className = "door__note";
    note.textContent = door.note;

    btn.appendChild(label);
    btn.appendChild(note);
    btn.addEventListener("click", () => moveToRoom(door.next));

    doorListEl.appendChild(btn);
  });
}

function renderRoom() {
  const data = getRoomData(currentRoomCode);
  roomNameEl.textContent = data.name;
  roomCodeEl.textContent = currentRoomCode;
  renderDoors(data);
  updateBreadcrumb();
  reverseBtn.disabled = breadcrumb.length <= 1;
}

function moveToRoom(nextCode) {
  currentRoomCode = nextCode;
  breadcrumb.push(nextCode);
  renderRoom();
}

reverseBtn.addEventListener("click", () => {
  if (breadcrumb.length <= 1) return;
  breadcrumb.pop();
  currentRoomCode = breadcrumb[breadcrumb.length - 1];
  renderRoom();
});

restartBtn.addEventListener("click", () => {
  breadcrumb = [defaultRoomCode];
  currentRoomCode = defaultRoomCode;
  renderRoom();
});

renderRoom();
