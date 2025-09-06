import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

// ✅ SMART LOADING MANAGER
const loadingManager = new THREE.LoadingManager(() => {
    console.log('All 3D assets loaded!');
    if (window.onAssetsLoaded) {
        window.onAssetsLoaded();
    }
});

loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
    console.log(`Loading: ${itemsLoaded}/${itemsTotal} - ${url}`);
};

loadingManager.onError = function (url) {
    console.error('Error loading:', url);
};

// --------------------- Scene & Camera ---------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(250, 20, 0);
camera.lookAt(0, 0, 0);

// --------------------- Renderer ---------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --------------------- Controls ---------------------
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.target.set(0, 1, 0);
orbitControls.update();

const fpsControls = new PointerLockControls(camera, renderer.domElement);
fpsControls.enabled = false;

// --------------------- Movement ---------------------
const move = { forward: false, backward: false, left: false, right: false };
let baseSpeed = 4, runSpeed = 8, isRunning = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();

// Jump / Gravity
let canJump = true, verticalVelocity = 0, gravity = -20, jumpStrength = 6;

// Bunny hop
let bunnyHopMultiplier = 1, maxBunnyHop = 1;//badla

// Crouch
let isCrouching = false, crouchOffset = -0.7, crouchSpeed = 1, normalSpeed = baseSpeed;
let groundHeight = -0.5;//badla

// --------------------- MOBILE CONTROLS ---------------------
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let joystickActive = true;
let joystickVector = new THREE.Vector2(0, 0);
let rightTouchId = null;

// Touch controls
let touchStartX = 0, touchStartY = 0;
let touchCurrentX = 0, touchCurrentY = 0;
let touchLookSensitivity = 0.01;

function createMobileControls() {
    if (!isMobileDevice && window.innerWidth > 768) return;

    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 200px;
        pointer-events: none;
        z-index: 1000;
    `;

    // Joystick
    const joystickContainer = document.createElement('div');
    joystickContainer.style.cssText = `
        position: absolute;
        bottom: 36px;
        left: 30px;
        width: 120px;
        height: 120px;
        background: rgba(255, 255, 255, 0.2);
        border: 3px solid rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        pointer-events: auto;
        touch-action: none;
    `;

    const joystickKnob = document.createElement('div');
    joystickKnob.style.cssText = `
        position: absolute;
        width: 50px;
        height: 50px;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        transition: all 0.1s ease;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    `;

    joystickContainer.appendChild(joystickKnob);

    // Jump Button
    const jumpButton = document.createElement('div');
    jumpButton.style.cssText = `
        position: absolute;
        bottom: 120px;
        right: 30px;
        width: 80px;
        height: 80px;
        background: rgba(76, 175, 80, 0.8);
        border: 3px solid rgba(76, 175, 80, 1);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 14px;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        font-family: 'Inter', sans-serif;
    `;
    jumpButton.textContent = 'JUMP';

    // Sprint Button
    const sprintButton = document.createElement('div');
    sprintButton.style.cssText = `
        position: absolute;
        bottom: 30px;
        right: 30px;
        width: 80px;
        height: 80px;
        background: rgba(255, 152, 0, 0.8);
        border: 3px solid rgba(255, 152, 0, 1);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 14px;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        font-family: 'Inter', sans-serif;
    `;
    sprintButton.textContent = 'SPRINT';

    // Camera mode toggle for mobile
    const cameraModeButton = document.createElement('div');
    cameraModeButton.style.cssText = `
        position: absolute;
        top: 120px;
        right: 130px;
        width: 60px;
        height: 40px;
        background: rgba(33, 150, 243, 0.8);
        border: 2px solid rgba(33, 150, 243, 1);
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 10px;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        font-family: 'Inter', sans-serif;
    `;
    cameraModeButton.textContent = 'CAM';

    controlsContainer.appendChild(joystickContainer);
    controlsContainer.appendChild(jumpButton);
    controlsContainer.appendChild(sprintButton);
    controlsContainer.appendChild(cameraModeButton);
    document.body.appendChild(controlsContainer);

    // Joystick Controls
    let joystickTouchId = null;
    const maxJoystickDistance = 35;

    function handleJoystickStart(e) {
        e.preventDefault();
        joystickActive = true;
        joystickTouchId = e.changedTouches ? e.changedTouches[0].identifier : null;
        joystickKnob.style.transition = 'none';
    }

    function handleJoystickMove(e) {
        if (!joystickActive) return;

        let clientX, clientY;
        if (e.changedTouches) {
            const touch = Array.from(e.changedTouches).find(t => t.identifier === joystickTouchId);
            if (!touch) return;
            clientX = touch.clientX;
            clientY = touch.clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const rect = joystickContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance <= maxJoystickDistance) {
            joystickKnob.style.transform = `translate(${deltaX - 25}px, ${deltaY - 25}px)`;
            joystickVector.set(deltaX / maxJoystickDistance, -deltaY / maxJoystickDistance);
        } else {
            const normalizedX = (deltaX / distance) * maxJoystickDistance;
            const normalizedY = (deltaY / distance) * maxJoystickDistance;
            joystickKnob.style.transform = `translate(${normalizedX - 25}px, ${normalizedY - 25}px)`;
            joystickVector.set(normalizedX / maxJoystickDistance, -normalizedY / maxJoystickDistance);
        }

        // Update movement state based on joystick
        const threshold = 0.2;
        move.forward = joystickVector.y > threshold;
        move.backward = joystickVector.y < -threshold;
        move.left = joystickVector.x < -threshold;
        move.right = joystickVector.x > threshold;
    }

    function handleJoystickEnd(e) {
        if (e.changedTouches && joystickTouchId !== null) {
            const touch = Array.from(e.changedTouches).find(t => t.identifier === joystickTouchId);
            if (!touch) return;
        }

        joystickActive = false;
        joystickTouchId = null;
        joystickKnob.style.transition = 'all 0.2s ease';
        joystickKnob.style.transform = 'translate(-50%, -50%)';
        joystickVector.set(0, 0);

        // Reset movement
        move.forward = false;
        move.backward = false;
        move.left = false;
        move.right = false;
    }

    // Touch events for joystick
    joystickContainer.addEventListener('touchstart', handleJoystickStart, { passive: false });
    joystickContainer.addEventListener('touchmove', handleJoystickMove, { passive: false });
    joystickContainer.addEventListener('touchend', handleJoystickEnd, { passive: false });

    // Mouse events for joystick (for testing on desktop)
    joystickContainer.addEventListener('mousedown', handleJoystickStart);
    document.addEventListener('mousemove', (e) => {
        if (joystickActive && !e.changedTouches) handleJoystickMove(e);
    });
    document.addEventListener('mouseup', (e) => {
        if (joystickActive && !e.changedTouches) handleJoystickEnd(e);
    });

    // Jump Button
    function handleJump(e) {
        e.preventDefault();
        if (canJump && !isCrouching && activeControls === fpsControls) {
            const headCheck = checkHeadCollision(camera.position);
            if (!headCheck) {
                verticalVelocity = jumpStrength;
                canJump = false;
                if (isRunning) bunnyHopMultiplier = Math.min(bunnyHopMultiplier * 1.1, maxBunnyHop);
            }
        }
        jumpButton.style.transform = 'scale(0.9)';
        setTimeout(() => {
            jumpButton.style.transform = 'scale(1)';
        }, 100);
    }

    jumpButton.addEventListener('touchstart', handleJump, { passive: false });
    jumpButton.addEventListener('mousedown', handleJump);

    // Sprint Button
    function handleSprintStart(e) {
        e.preventDefault();
        isRunning = true;
        sprintButton.style.background = 'rgba(255, 152, 0, 1)';
        sprintButton.style.transform = 'scale(0.95)';
    }

    function handleSprintEnd(e) {
        e.preventDefault();
        isRunning = false;
        sprintButton.style.background = 'rgba(255, 152, 0, 0.8)';
        sprintButton.style.transform = 'scale(1)';
    }

    sprintButton.addEventListener('touchstart', handleSprintStart, { passive: false });
    sprintButton.addEventListener('touchend', handleSprintEnd, { passive: false });
    sprintButton.addEventListener('mousedown', handleSprintStart);
    sprintButton.addEventListener('mouseup', handleSprintEnd);

    // Camera Mode Button
    cameraModeButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (activeControls === orbitControls) {
            activateFPSControls();
            camera.rotation.set(0, 0, 0);
            cameraModeButton.textContent = 'ORBIT';
        } else {
            activateOrbitControls();
            cameraModeButton.textContent = 'CAM';
        }
    }, { passive: false });

    // Touch look controls for camera (when in FPS mode)
    let touchLookActive = false;
    let lastTouchX = 0, lastTouchY = 0;

    // Store pitch and yaw separately for proper FPS camera control
    let cameraPitch = 0; // Vertical rotation (around X-axis)
    let cameraYaw = 0;   // Horizontal rotation (around Y-axis)

    renderer.domElement.addEventListener('touchstart', (e) => {
        if (activeControls !== fpsControls) return;
        for (let t of e.changedTouches) {
            // ignore joystick touch if already assigned
            if (joystickTouchId !== null && t.identifier === joystickTouchId) continue;

            // if touch starts on right half and we don't have a look finger yet - assign it
            if (rightTouchId === null && t.clientX > window.innerWidth / 2) {
                rightTouchId = t.identifier;
                touchLookActive = true;
                lastTouchX = t.clientX;
                lastTouchY = t.clientY;
            }
        }
    }, { passive: true });

    renderer.domElement.addEventListener('touchmove', (e) => {
        if (activeControls !== fpsControls) return;
        for (let t of e.changedTouches) {
            // joystick finger - delegate to existing joystick handler
            if (joystickTouchId !== null && t.identifier === joystickTouchId) {
                handleJoystickMove({ changedTouches: [t], preventDefault: () => { } });
                continue;
            }

            // look finger
            if (rightTouchId !== null && t.identifier === rightTouchId) {
                const deltaX = t.clientX - lastTouchX;
                const deltaY = t.clientY - lastTouchY;

                cameraYaw -= deltaX * touchLookSensitivity;
                cameraPitch -= deltaY * touchLookSensitivity;

                cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraPitch));
                camera.rotation.order = 'YXZ';
                camera.rotation.y = cameraYaw;
                camera.rotation.x = cameraPitch;

                lastTouchX = t.clientX;
                lastTouchY = t.clientY;
            }
        }
    }, { passive: true });

    renderer.domElement.addEventListener('touchend', (e) => {
        for (let t of e.changedTouches) {
            // joystick ended
            if (joystickTouchId !== null && t.identifier === joystickTouchId) {
                handleJoystickEnd({ changedTouches: [t], preventDefault: () => { } });
                joystickTouchId = null;
            }

            // look finger ended
            if (rightTouchId !== null && t.identifier === rightTouchId) {
                rightTouchId = null;
                touchLookActive = false;
            }
        }
    }, { passive: true });
}

// Initialize mobile controls
createMobileControls();

// --------------------- FULLSCREEN BUTTON ---------------------
function createFullscreenButton() {
    const fullscreenButton = document.createElement('div');
    fullscreenButton.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: 120px;
        height: 45px;
        background: rgba(33, 150, 243, 0.9);
        border: 2px solid rgba(33, 150, 243, 1);
        border-radius: 25px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 14px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        cursor: pointer;
        user-select: none;
        z-index: 2000;
        transition: all 0.2s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    `;
    fullscreenButton.textContent = 'FULLSCREEN';

    // Hover effects
    fullscreenButton.addEventListener('mouseenter', () => {
        fullscreenButton.style.background = 'rgba(33, 150, 243, 1)';
        fullscreenButton.style.transform = 'translateX(-50%) scale(1.05)';
        fullscreenButton.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
    });

    fullscreenButton.addEventListener('mouseleave', () => {
        fullscreenButton.style.background = 'rgba(33, 150, 243, 0.9)';
        fullscreenButton.style.transform = 'translateX(-50%) scale(1)';
        fullscreenButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    });

    // Fullscreen functionality
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            document.documentElement.requestFullscreen().then(() => {
                fullscreenButton.textContent = 'EXIT FULLSCREEN';
                fullscreenButton.style.background = 'rgba(255, 152, 0, 0.9)';
                fullscreenButton.style.borderColor = 'rgba(255, 152, 0, 1)';
                fullscreenButton.style.width = '150px';
                console.log('Entered fullscreen mode');
            }).catch((err) => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            // Exit fullscreen
            document.exitFullscreen().then(() => {
                fullscreenButton.textContent = 'FULLSCREEN';
                fullscreenButton.style.background = 'rgba(33, 150, 243, 0.9)';
                fullscreenButton.style.borderColor = 'rgba(33, 150, 243, 1)';
                fullscreenButton.style.width = '120px';
                console.log('Exited fullscreen mode');
            }).catch((err) => {
                console.error('Error attempting to exit fullscreen:', err);
            });
        }
    }

    // Click and touch events
    fullscreenButton.addEventListener('click', toggleFullscreen);
    fullscreenButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        toggleFullscreen();
    }, { passive: false });

    // Listen for fullscreen changes (when user presses ESC or F11)
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            fullscreenButton.textContent = 'EXIT FULLSCREEN';
            fullscreenButton.style.background = 'rgba(255, 152, 0, 0.9)';
            fullscreenButton.style.borderColor = 'rgba(255, 152, 0, 1)';
            fullscreenButton.style.width = '150px';
        } else {
            fullscreenButton.textContent = 'FULLSCREEN';
            fullscreenButton.style.background = 'rgba(33, 150, 243, 0.9)';
            fullscreenButton.style.borderColor = 'rgba(33, 150, 243, 1)';
            fullscreenButton.style.width = '120px';
        }
    });

    // Add button to page
    document.body.appendChild(fullscreenButton);

    return fullscreenButton;
}

// Create fullscreen button
createFullscreenButton();

// --------------------- RAYCASTING COLLISION SYSTEM ---------------------
const collidableObjects = [];
const raycaster = new THREE.Raycaster();

// Player collision properties
const playerRadius = 0.4; // Player's collision radius //badla 0.4
const playerHeight = 1.2; // Player's height //badla1.2
const collisionDistance = 0.5  ; // Distance to check for collisions //badla 0.5

// Raycasting directions for collision detection
const rayDirections = [
    new THREE.Vector3(1, 0, 0),     // right
    new THREE.Vector3(-1, 0, 0),    // left
    new THREE.Vector3(0, 0, 1),     // forward
    new THREE.Vector3(0, 0, -1),    // backward
    new THREE.Vector3(0.707, 0, 0.707),   // diagonal front-right
    new THREE.Vector3(-0.707, 0, 0.707),  // diagonal front-left
    new THREE.Vector3(0.707, 0, -0.707),  // diagonal back-right
    new THREE.Vector3(-0.707, 0, -0.707), // diagonal back-left
];

// Vertical ray directions
const verticalRayDirections = [
    new THREE.Vector3(0, 1, 0),     // up
    new THREE.Vector3(0, -1, 0),    // down
];

// Function to check horizontal collision using raycasting
function checkHorizontalCollision(position) {
    for (let direction of rayDirections) {
        raycaster.set(position, direction);
        const intersects = raycaster.intersectObjects(collidableObjects, true);

        if (intersects.length > 0 && intersects[0].distance < collisionDistance) {
            if (window.DEBUG_COLLISION_LOG) {
                console.log(`Horizontal collision detected at distance: ${intersects[0].distance.toFixed(3)} in direction: ${direction.x.toFixed(1)}, ${direction.y.toFixed(1)}, ${direction.z.toFixed(1)}`);
                console.log(`Hit object: ${intersects[0].object.name || 'unnamed'}`);
            }
            return true;
        }
    }
    return false;
}

// Function to check vertical collision (for jumping and falling)
function checkVerticalCollision(position, direction = 'up') {
    const rayDirection = direction === 'up' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
    const rayOrigin = position.clone();

    // Adjust ray origin based on direction
    if (direction === 'up') {
        rayOrigin.y += playerHeight * 0.8; // Cast from near the top of player
    } else {
        rayOrigin.y += 0.1; // Cast from slightly above ground level
    }

    raycaster.set(rayOrigin, rayDirection);
    const intersects = raycaster.intersectObjects(collidableObjects, true);

    if (intersects.length > 0) {
        const distance = intersects[0].distance;
        const maxDistance = direction === 'up' ? playerHeight * 0.3 : playerHeight;

        if (distance < maxDistance) {
            if (window.DEBUG_COLLISION_LOG) {
                console.log(`${direction} collision at distance: ${distance.toFixed(3)}, hit: ${intersects[0].object.name || 'unnamed'}`);
            }
            return {
                collision: true,
                distance: distance,
                point: intersects[0].point,
                object: intersects[0].object
            };
        }
    }

    return { collision: false, distance: Infinity, point: null, object: null };
}

// Function to check head collision before jumping
function checkHeadCollision(position) {
    const headPosition = position.clone();
    headPosition.y += playerHeight * 0.9; // Check from head level

    raycaster.set(headPosition, new THREE.Vector3(0, 1, 0));
    const intersects = raycaster.intersectObjects(collidableObjects, true);

    if (intersects.length > 0 && intersects[0].distance < 0.3) {
        if (window.DEBUG_COLLISION_LOG) {
            console.log(`Head collision detected at distance: ${intersects[0].distance.toFixed(3)}`);
        }
        return true;
    }

    return false;
}

// Enhanced sliding collision that uses multiple rays
function getValidMovement(currentPos, desiredPos) {
    // Check if the desired position causes collision
    if (!checkHorizontalCollision(desiredPos)) {
        return desiredPos;
    }

    // Try sliding along walls by testing individual axis movements
    const deltaX = desiredPos.x - currentPos.x;
    const deltaZ = desiredPos.z - currentPos.z;

    // Try X movement only
    const xOnlyPos = new THREE.Vector3(currentPos.x + deltaX, currentPos.y, currentPos.z);
    if (!checkHorizontalCollision(xOnlyPos)) {
        return xOnlyPos;
    }

    // Try Z movement only
    const zOnlyPos = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z + deltaZ);
    if (!checkHorizontalCollision(zOnlyPos)) {
        return zOnlyPos;
    }

    // Try partial movements (for smoother sliding)
    const partialX = new THREE.Vector3(currentPos.x + deltaX * 0.5, currentPos.y, currentPos.z);
    if (!checkHorizontalCollision(partialX)) {
        return partialX;
    }

    const partialZ = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z + deltaZ * 0.5);
    if (!checkHorizontalCollision(partialZ)) {
        return partialZ;
    }

    // No valid movement found
    return currentPos;
}

// Function to add mesh to collision detection
function addToCollisionDetection(mesh) {
    if (mesh.isMesh) {
        collidableObjects.push(mesh);
        console.log(`Added mesh to collision detection: ${mesh.name || 'unnamed'}`);

        // Create debug visualization if enabled
        if (window.DEBUG_COLLIDERS) {
            // Clone the mesh for debug visualization
            const debugMesh = mesh.clone();
            debugMesh.material = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                wireframe: true,
                transparent: true,
                opacity: 0.3
            });
            scene.add(debugMesh);
        }
    }
}

// Function to create debug rays (visual representation)
function createDebugRays() {
    if (!window.DEBUG_RAYS) return;

    const rayMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });

    rayDirections.forEach((direction, index) => {
        const rayGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            direction.clone().multiplyScalar(collisionDistance)
        ]);

        const rayLine = new THREE.Line(rayGeometry, rayMaterial);
        rayLine.name = `debugRay_${index}`;
        scene.add(rayLine);
    });
}

// Function to update debug ray positions
function updateDebugRays() {
    if (!window.DEBUG_RAYS) return;

    rayDirections.forEach((direction, index) => {
        const rayLine = scene.getObjectByName(`debugRay_${index}`);
        if (rayLine) {
            rayLine.position.copy(camera.position);
        }
    });
}

// --------------------- Keyboard Events (Enhanced with Arrow Keys) ---------------------
document.addEventListener('keydown', (e) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'AltRight', 'AltLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    switch (e.code) {
        // WASD Controls
        case 'KeyW':
        case 'ArrowUp':
            move.forward = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            move.backward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            move.left = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            move.right = true;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            isRunning = true;
            break;
        case 'Space':
            if (canJump && !isCrouching) {
                if (!checkHeadCollision(camera.position)) {
                    verticalVelocity = jumpStrength;
                    canJump = false;
                    if (isRunning) bunnyHopMultiplier = Math.min(bunnyHopMultiplier * 1.1, maxBunnyHop);
                } else {
                    console.log('Cannot jump - head collision detected');
                }
            }
            break;
        case 'AltRight':
        case 'AltLeft':
            verticalVelocity = 15;
            canJump = true;
            break;
    }
});

document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
            move.forward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            move.backward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            move.left = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            move.right = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            isRunning = false;
            break;
    }
});

// --------------------- Pointer Lock ---------------------
document.addEventListener('click', () => {
    if (activeControls === fpsControls && !isMobileDevice) fpsControls.lock();
});

// --------------------- Camera Mode Switching ---------------------
let activeControls = orbitControls;

function activateOrbitControls() {
    fpsControls.unlock && fpsControls.unlock();
    fpsControls.enabled = false;
    orbitControls.enabled = true;
    activeControls = orbitControls;
    console.log('Orbit Controls Activated');
    if (document.getElementById("cameraView")) {
        document.getElementById("cameraView").value = "orbit";
    }
}

function activateFPSControls() {
    orbitControls.enabled = false;
    fpsControls.enabled = true;
    activeControls = fpsControls;
    camera.position.set(150, 5, 0);//badla
    console.log('FPS Controls Activated');
    if (document.getElementById("cameraView")) {
        document.getElementById("cameraView").value = "fps";
    }
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyO') activateOrbitControls();
    if (e.code === 'KeyP') activateFPSControls();

    // Debug key to toggle collision mesh visibility
    if (e.code === 'KeyB') {
        window.DEBUG_COLLIDERS = !window.DEBUG_COLLIDERS;
        console.log('Debug colliders:', window.DEBUG_COLLIDERS);

        // Remove existing debug meshes
        const debugMeshes = scene.children.filter(child =>
            child.material && child.material.wireframe && child.material.color.getHex() === 0xff0000
        );
        debugMeshes.forEach(mesh => scene.remove(mesh));

        // Re-create debug meshes if enabled
        if (window.DEBUG_COLLIDERS && collidableObjects.length > 0) {
            console.log('Creating debug visualization for collision meshes...');
            collidableObjects.forEach((mesh, index) => {
                const debugMesh = mesh.clone();
                debugMesh.material = new THREE.MeshBasicMaterial({
                    color: 0xff0000,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.5
                });
                scene.add(debugMesh);
                console.log(`Debug mesh ${index}: ${mesh.name || 'unnamed'}`);
            });
        }
    }

    // Debug key to toggle ray visualization
    if (e.code === 'KeyR') {
        window.DEBUG_RAYS = !window.DEBUG_RAYS;
        console.log('Debug rays:', window.DEBUG_RAYS);

        if (window.DEBUG_RAYS) {
            createDebugRays();
        } else {
            // Remove debug rays
            rayDirections.forEach((direction, index) => {
                const rayLine = scene.getObjectByName(`debugRay_${index}`);
                if (rayLine) scene.remove(rayLine);
            });
        }
    }

    // Debug collision logging
    if (e.code === 'KeyL') {
        window.DEBUG_COLLISION_LOG = !window.DEBUG_COLLISION_LOG;
        console.log('Collision logging:', window.DEBUG_COLLISION_LOG);
    }

    // Show current player position and collision info
    if (e.code === 'KeyI') {
        console.log(`Player position: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`);
        console.log(`Ground height: ${groundHeight}`);
        console.log(`Total collision objects: ${collidableObjects.length}`);

        // Test collision at current position
        const hasCollision = checkHorizontalCollision(camera.position);
        console.log(`Collision at current position: ${hasCollision}`);

        // Test head collision
        const hasHeadCollision = checkHeadCollision(camera.position);
        console.log(`Head collision at current position: ${hasHeadCollision}`);
    }
});

if (document.getElementById("cameraView")) {
    document.getElementById("cameraView").addEventListener("change", (e) => {
        if (e.target.value === "orbit") activateOrbitControls();
        if (e.target.value === "fps") activateFPSControls();
    });
}

// --------------------- GLTF Loader with Raycasting Collision Detection ---------------------
const dracoLoader = new DRACOLoader(loadingManager);
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const loader = new GLTFLoader(loadingManager);
loader.setDRACOLoader(dracoLoader);

loader.load('/model.glb',
    (gltf) => {
        console.log('GLTF model loaded successfully');
        scene.add(gltf.scene);

        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);
        orbitControls.target.copy(center);
        orbitControls.update();

        // Wait a frame for transformations to apply, then setup collision detection
        requestAnimationFrame(() => {
            console.log('Setting up raycasting collision detection...');

            // Enhanced collision detection setup using raycasting
            gltf.scene.traverse((child) => {
                if (child.isMesh) {
                    console.log(`Processing mesh: ${child.name}, vertices: ${child.geometry.attributes.position.count}, rotation: (${child.rotation.x.toFixed(2)}, ${child.rotation.y.toFixed(2)}, ${child.rotation.z.toFixed(2)})`);

                    let shouldAddToCollision = false;

                    // Method 1: Objects with "COLLIDER" in name
                    if (child.name && child.name.includes("COLLIDER")) {
                        shouldAddToCollision = true;
                        child.visible = false; // Hide collision meshes
                        console.log(`Added COLLIDER mesh: ${child.name}`);
                    }
                    // Method 2: Specific collision objects
                    else if (child.name && (
                        child.name.toLowerCase().includes("roof") ||
                        child.name.toLowerCase().includes("ceiling") ||
                        child.name.toLowerCase().includes("top") ||
                        child.name.toLowerCase().includes("wall") ||
                        child.name.toLowerCase().includes("floor") ||
                        child.name.toLowerCase().includes("building") ||
                        child.name.toLowerCase().includes("structure") ||
                        child.name.toLowerCase().includes("collide")
                    )) {
                        shouldAddToCollision = true;
                        console.log(`Added named collision mesh: ${child.name}`);
                    }
                    // Method 3: Auto-detect large static meshes
                    else if (child.geometry && child.material) {
                        const meshBox = new THREE.Box3().setFromObject(child);
                        const size = meshBox.getSize(new THREE.Vector3());

                        // If object is large enough and not likely to be a small detail, treat as collidable
                        if ((size.x > 1 || size.y > 1 || size.z > 1) && child.geometry.attributes.position.count > 50) {
                            shouldAddToCollision = true;
                            console.log(`Added auto-detected mesh: ${child.name || 'unnamed'} (size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)})`);
                        }
                    }

                    if (shouldAddToCollision) {
                        addToCollisionDetection(child);
                    }
                }
            });

            console.log(`Setup complete. Total collision objects: ${collidableObjects.length}`);

            // List all collision objects for debugging
            console.log('Collision objects:');
            collidableObjects.forEach((obj, index) => {
                const box = new THREE.Box3().setFromObject(obj);
                const size = box.getSize(new THREE.Vector3());
                const center = box.getCenter(new THREE.Vector3());
                console.log(`  ${index}: ${obj.name || 'unnamed'} at (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}) size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`);
            });
        });
    },
    (progress) => {
        const percentComplete = (progress.loaded / progress.total) * 100;
        console.log(`GLTF Loading: ${Math.round(percentComplete)}%`);
    },
    (error) => {
        console.error('GLTF loading error:', error);
    }
);

// --------------------- HDRI Environment ---------------------
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

new EXRLoader(loadingManager).setPath('/').load('sky.exr',
    (texture) => {
        console.log('HDRI loaded successfully');
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        scene.environment = envMap;
        scene.background = envMap;
        texture.dispose();
        pmremGenerator.dispose();
    },
    (progress) => {
        const percentComplete = (progress.loaded / progress.total) * 100;
        console.log(`HDRI Loading: ${Math.round(percentComplete)}%`);
    },
    (error) => {
        console.error('HDRI loading error:', error);
    }
);

// --------------------- Window Resize ---------------------
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --------------------- Animation Loop with Raycasting Collision ---------------------
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (activeControls === fpsControls) {
        velocity.set(0, 0, 0);
        direction.set(0, 0, 0);

        if (move.forward) direction.z -= 1;
        if (move.backward) direction.z += 1;
        if (move.left) direction.x -= 1;
        if (move.right) direction.x += 1;
        direction.normalize();

        const currentSpeed = (isRunning ? runSpeed : baseSpeed) * bunnyHopMultiplier;
        const moveDistance = currentSpeed * delta;

        // Calculate desired movement in world coordinates
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();

        camera.getWorldDirection(forward);
        forward.y = 0; // Keep movement horizontal
        forward.normalize();

        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
        right.normalize();

        // Calculate desired position
        const currentPos = camera.position.clone();
        const desiredPos = currentPos.clone();

        desiredPos.add(forward.clone().multiplyScalar(-direction.z * moveDistance));
        desiredPos.add(right.clone().multiplyScalar(direction.x * moveDistance));

        // Apply collision-aware horizontal movement using raycasting
        const validPos = getValidMovement(currentPos, desiredPos);
        camera.position.copy(validPos);

        // Enhanced gravity and vertical collision using raycasting
        const prevY = camera.position.y;
        verticalVelocity += gravity * delta;

        // Calculate next vertical position
        const nextY = camera.position.y + verticalVelocity * delta;
        const nextPos = new THREE.Vector3(camera.position.x, nextY, camera.position.z);

        // Check vertical collision based on movement direction
        if (verticalVelocity > 0) {
            // Moving up (jumping) - check head collision
            const upCheck = checkVerticalCollision(nextPos, 'up');
            if (upCheck.collision) {
                // Hit ceiling/roof - stop upward movement
                verticalVelocity = 0;
                camera.position.y = upCheck.point.y - playerHeight - 0.1; // Position just below ceiling
                console.log('Head hit ceiling at Y:', upCheck.point.y);
            } else {
                camera.position.y = nextY;
            }
        } else {
            // Moving down (falling) - check ground collision
            const downCheck = checkVerticalCollision(nextPos, 'down');
            if (downCheck.collision) {
                // Hit ground/floor
                verticalVelocity = 0;
                canJump = true;
                camera.position.y = downCheck.point.y; // Stand on the surface
                if (!move.forward && !move.backward && !move.left && !move.right) {
                    bunnyHopMultiplier = 1;
                }
            } else {
                camera.position.y = nextY;
            }
        }

        // Fallback ground collision (original system as backup)
        let currentGround = isCrouching ? groundHeight + crouchOffset : groundHeight;
        if (camera.position.y <= currentGround) {
            camera.position.y = currentGround;
            verticalVelocity = 0;
            canJump = true;
            if (!move.forward && !move.backward && !move.left && !move.right) {
                bunnyHopMultiplier = 1;
            }
        }

        // Update debug rays if enabled
        updateDebugRays();
    } else {
        orbitControls.update();
    }

    renderer.render(scene, camera);
}

// Start animation loop
animate();

// --------------------- Helper Functions for Manual Setup ---------------------

// Function to manually add collision objects (call this from console)
window.addCollisionObject = function (objectName) {
    const object = scene.getObjectByName(objectName);
    if (object && object.isMesh) {
        addToCollisionDetection(object);
        console.log(`Manually added ${objectName} to collision detection`);
    } else {
        console.log(`Object ${objectName} not found or is not a mesh`);
    }
};

// Function to remove collision objects
window.removeCollisionObject = function (objectName) {
    const index = collidableObjects.findIndex(obj => obj.name === objectName);
    if (index !== -1) {
        collidableObjects.splice(index, 1);
        console.log(`Removed ${objectName} from collision detection`);
    } else {
        console.log(`Object ${objectName} not found in collision objects`);
    }
};

// Function to clear all collision objects
window.clearAllCollisionObjects = function () {
    collidableObjects.length = 0;
    console.log('All collision objects cleared');

    // Remove debug visualizations
    const debugMeshes = scene.children.filter(child =>
        child.material && child.material.wireframe && child.material.color.getHex() === 0xff0000
    );
    debugMeshes.forEach(mesh => scene.remove(mesh));
};

// Function to list all collision objects
window.listCollisionObjects = function () {
    console.log(`Total collision objects: ${collidableObjects.length}`);
    collidableObjects.forEach((obj, index) => {
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        console.log(`${index}: ${obj.name || 'unnamed'} - center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}) - size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} - rotation: (${obj.rotation.x.toFixed(2)}, ${obj.rotation.y.toFixed(2)}, ${obj.rotation.z.toFixed(2)})`);
    });
};

// Function to test collision at specific position
window.testCollisionAt = function (x, y, z) {
    const testPos = new THREE.Vector3(x, y, z);
    const hasCollision = checkHorizontalCollision(testPos);
    console.log(`Collision at (${x}, ${y}, ${z}): ${hasCollision}`);
    return hasCollision;
};

// Add helper functions for debugging
window.testHeadCollision = function () {
    const hasHeadCollision = checkHeadCollision(camera.position);
    console.log('Head collision test:', hasHeadCollision);
};

window.testRoofJump = function () {
    console.log('Testing roof collision with raycasting...');
    verticalVelocity = 10; // Strong jump
    canJump = false;
};