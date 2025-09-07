import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

// ✅ FIXED OBB (Oriented Bounding Box) Class - Properly transforms AABB to OBB
class OBB {
    constructor(center, extents, rotation) {
        this.center = center ? center.clone() : new THREE.Vector3();
        this.extents = extents ? extents.clone() : new THREE.Vector3(); // Half-sizes along each axis
        this.rotation = rotation ? rotation.clone() : new THREE.Euler();
        this.quaternion = new THREE.Quaternion();
        this.axes = [
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3()
        ];
        this.updateAxes();
    }

    updateAxes() {
        // Get the three axes of the OBB from the rotation matrix
        const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(this.rotation);
        this.axes[0].set(1, 0, 0).applyMatrix4(rotationMatrix);
        this.axes[1].set(0, 1, 0).applyMatrix4(rotationMatrix);
        this.axes[2].set(0, 0, 1).applyMatrix4(rotationMatrix);

        // Update quaternion
        this.quaternion.setFromEuler(this.rotation);
    }

    /**
     * PROPER 3-STEP OBB CREATION:
     * 1. Build AABB (Box3) from mesh geometry
     * 2. Use that box to get the size & center
     * 3. Transform it into an OBB by applying mesh's world rotation and position
     */
    static fromMesh(mesh) {
        console.log(`Creating OBB for mesh: ${mesh.name || 'unnamed'}`);

        // STEP 1: Build AABB (Box3) from mesh geometry
        if (!mesh.geometry.boundingBox) {
            mesh.geometry.computeBoundingBox();
        }

        // Get the local space AABB from geometry
        const localAABB = new THREE.Box3().copy(mesh.geometry.boundingBox);

        // STEP 2: Use that box to get the size & center
        const aabbSize = new THREE.Vector3();
        const aabbCenter = new THREE.Vector3();

        localAABB.getSize(aabbSize);
        localAABB.getCenter(aabbCenter);

        // STEP 3: Transform it into an OBB by applying mesh's world rotation and position

        // Update world matrix to ensure we have current transforms
        mesh.updateMatrixWorld(true);

        // Extract world transformation components
        const worldPosition = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();

        mesh.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

        // Transform the AABB center to world space
        const worldCenter = aabbCenter.clone();
        worldCenter.multiply(worldScale); // Apply scale first
        worldCenter.applyQuaternion(worldQuaternion); // Then rotation
        worldCenter.add(worldPosition); // Finally translation

        // Apply world scale to the size and get half-extents
        const worldExtents = aabbSize.clone();
        worldExtents.multiply(worldScale);
        worldExtents.multiplyScalar(0.5); // Convert to half-extents

        // Get world rotation as Euler
        const worldRotation = new THREE.Euler().setFromQuaternion(worldQuaternion);

        console.log(`OBB Created - Center: (${worldCenter.x.toFixed(2)}, ${worldCenter.y.toFixed(2)}, ${worldCenter.z.toFixed(2)}) Extents: (${worldExtents.x.toFixed(2)}, ${worldExtents.y.toFixed(2)}, ${worldExtents.z.toFixed(2)})`);

        // Create and return the OBB
        return new OBB(worldCenter, worldExtents, worldRotation);
    }

    // Check if this OBB intersects with another OBB
    intersectsOBB(other) {
        const separation = new THREE.Vector3().subVectors(other.center, this.center);

        // Test separation along all 15 potential separating axes
        const axes = [...this.axes, ...other.axes];

        // Add cross products of axes
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const crossAxis = new THREE.Vector3().crossVectors(this.axes[i], other.axes[j]);
                if (crossAxis.lengthSq() > 0.0001) {
                    crossAxis.normalize();
                    axes.push(crossAxis);
                }
            }
        }

        for (const axis of axes) {
            if (!this.testSeparatingAxis(axis, other, separation)) {
                return false;
            }
        }

        return true;
    }

    testSeparatingAxis(axis, other, separation) {
        const projectedSeparation = Math.abs(separation.dot(axis));
        const projectedThis = this.getProjectedRadius(axis);
        const projectedOther = other.getProjectedRadius(axis);

        return projectedSeparation <= (projectedThis + projectedOther);
    }

    getProjectedRadius(axis) {
        return Math.abs(this.axes[0].dot(axis)) * this.extents.x +
            Math.abs(this.axes[1].dot(axis)) * this.extents.y +
            Math.abs(this.axes[2].dot(axis)) * this.extents.z;
    }

    // Check if a point is inside this OBB
    containsPoint(point) {
        const localPoint = new THREE.Vector3().subVectors(point, this.center);

        for (let i = 0; i < 3; i++) {
            const projection = localPoint.dot(this.axes[i]);
            if (Math.abs(projection) > this.extents.getComponent(i)) {
                return false;
            }
        }

        return true;
    }

    // Create debug wireframe mesh
    createDebugMesh(color = 0xff0000, opacity = 0.5) {
        const geometry = new THREE.BoxGeometry(this.extents.x * 2, this.extents.y * 2, this.extents.z * 2);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            wireframe: true,
            transparent: true,
            opacity: opacity
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(this.center);
        mesh.rotation.copy(this.rotation);
        return mesh;
    }
}

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
let bunnyHopMultiplier = 1, maxBunnyHop = 3;

// Crouch
let isCrouching = false, crouchOffset = -0.7, crouchSpeed = 1, normalSpeed = baseSpeed;
let groundHeight = -0.5;

// --------------------- FIXED OBB COLLISION SYSTEM ---------------------
const collisionOBBs = [];
const debugMeshes = [];
let playerOBB;

// Player collision properties
const playerRadius = 0.4;
const playerHeight = 1.2;

// Initialize player OBB
function initializePlayerOBB() {
    const playerExtents = new THREE.Vector3(playerRadius, playerHeight/2, playerRadius);
    const playerCenter = camera.position.clone();
    const playerRotation = new THREE.Euler(0, 0, 0);

    playerOBB = new OBB(playerCenter, playerExtents, playerRotation);
}

// Update player OBB position
function updatePlayerOBB() {
    if (playerOBB) {
        playerOBB.center.copy(camera.position);
        playerOBB.center.y += playerHeight / 2; // Center the OBB on player
        playerOBB.updateAxes();
    }
}

// Check horizontal collision using FIXED OBB
function checkHorizontalCollisionOBB(position) {
    if (!playerOBB) return false;

    // Create temporary OBB at the test position
    const testOBB = new OBB(
        new THREE.Vector3(position.x, position.y + playerHeight / 2, position.z),
        playerOBB.extents.clone(),
        new THREE.Euler(0, 0, 0)
    );

    for (const obb of collisionOBBs) {
        if (testOBB.intersectsOBB(obb)) {
            if (window.DEBUG_COLLISION_LOG) {
                console.log('OBB collision detected');
            }
            return true;
        }
    }

    return false;
}

// Check vertical collision using FIXED OBB
function checkVerticalCollisionOBB(position, direction = 'down') {
    if (!playerOBB) return { collision: false, height: position.y };

    const testHeight = direction === 'up' ? position.y + playerHeight * 0.1 : position.y;
    const testOBB = new OBB(
        new THREE.Vector3(position.x, testHeight + playerHeight / 2, position.z),
        playerOBB.extents.clone(),
        new THREE.Euler(0, 0, 0)
    );

    let closestHeight = direction === 'up' ? Infinity : -Infinity;
    let hasCollision = false;

    for (const obb of collisionOBBs) {
        if (testOBB.intersectsOBB(obb)) {
            hasCollision = true;

            if (direction === 'up') {
                // Hit ceiling - find lowest ceiling point
                const ceilingY = obb.center.y - obb.extents.y;
                if (ceilingY < closestHeight) {
                    closestHeight = ceilingY;
                }
            } else {
                // Hit floor - find highest floor point
                const floorY = obb.center.y + obb.extents.y;
                if (floorY > closestHeight) {
                    closestHeight = floorY;
                }
            }
        }
    }

    return {
        collision: hasCollision,
        height: hasCollision ? closestHeight : position.y
    };
}

// Enhanced sliding collision with FIXED OBB
function getValidMovementOBB(currentPos, desiredPos) {
    if (!checkHorizontalCollisionOBB(desiredPos)) {
        return desiredPos;
    }

    // Try sliding along individual axes
    const deltaX = desiredPos.x - currentPos.x;
    const deltaZ = desiredPos.z - currentPos.z;

    // Try X movement only
    const xOnlyPos = new THREE.Vector3(currentPos.x + deltaX, currentPos.y, currentPos.z);
    if (!checkHorizontalCollisionOBB(xOnlyPos)) {
        return xOnlyPos;
    }

    // Try Z movement only
    const zOnlyPos = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z + deltaZ);
    if (!checkHorizontalCollisionOBB(zOnlyPos)) {
        return zOnlyPos;
    }

    // Try partial movements
    const partialX = new THREE.Vector3(currentPos.x + deltaX * 0.5, currentPos.y, currentPos.z);
    if (!checkHorizontalCollisionOBB(partialX)) {
        return partialX;
    }

    const partialZ = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z + deltaZ * 0.5);
    if (!checkHorizontalCollisionOBB(partialZ)) {
        return partialZ;
    }

    return currentPos;
}

// FIXED: Create OBB from mesh using proper 3-step process
function createOBBFromMesh(mesh) {
    return OBB.fromMesh(mesh);
}

// FIXED: Add mesh to OBB collision detection
function addToOBBCollision(mesh) {
    if (mesh.isMesh) {
        const obb = createOBBFromMesh(mesh);
        collisionOBBs.push(obb);
        console.log(`Added OBB collision: ${mesh.name || 'unnamed'}`);

        // Create debug visualization if enabled
        if (window.DEBUG_COLLIDERS) {
            const debugMesh = obb.createDebugMesh();
            scene.add(debugMesh);
            debugMeshes.push(debugMesh);
        }
    }
}

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
            const headCheck = checkVerticalCollisionOBB(
                new THREE.Vector3(camera.position.x, camera.position.y + jumpStrength * 0.1, camera.position.z),
                'up'
            );
            if (!headCheck.collision) {
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
    let cameraPitch = 0;
    let cameraYaw = 0;

    renderer.domElement.addEventListener('touchstart', (e) => {
        if (activeControls !== fpsControls) return;
        for (let t of e.changedTouches) {
            if (joystickTouchId !== null && t.identifier === joystickTouchId) continue;

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
            if (joystickTouchId !== null && t.identifier === joystickTouchId) {
                handleJoystickMove({ changedTouches: [t], preventDefault: () => { } });
                continue;
            }

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
            if (joystickTouchId !== null && t.identifier === joystickTouchId) {
                handleJoystickEnd({ changedTouches: [t], preventDefault: () => { } });
                joystickTouchId = null;
            }

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
                const headCheck = checkVerticalCollisionOBB(
                    new THREE.Vector3(camera.position.x, camera.position.y + jumpStrength * 0.1, camera.position.z),
                    'up'
                );
                if (!headCheck.collision) {
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
    camera.position.set(150, 5, 0);
    console.log('FPS Controls Activated');

    // Initialize player OBB when switching to FPS
    if (!playerOBB) {
        initializePlayerOBB();
    }

    if (document.getElementById("cameraView")) {
        document.getElementById("cameraView").value = "fps";
    }
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyO') activateOrbitControls();
    if (e.code === 'KeyP') activateFPSControls();

    // Debug key to toggle OBB visualization
    if (e.code === 'KeyB') {
        window.DEBUG_COLLIDERS = !window.DEBUG_COLLIDERS;
        console.log('Debug OBBs:', window.DEBUG_COLLIDERS);

        // Remove existing debug meshes
        debugMeshes.forEach(mesh => scene.remove(mesh));
        debugMeshes.length = 0;

        // Re-create debug meshes if enabled
        if (window.DEBUG_COLLIDERS && collisionOBBs.length > 0) {
            console.log('Creating debug visualization for OBBs...');
            collisionOBBs.forEach((obb, index) => {
                const debugMesh = obb.createDebugMesh();
                scene.add(debugMesh);
                debugMeshes.push(debugMesh);
                console.log(`Debug OBB ${index}: center (${obb.center.x.toFixed(1)}, ${obb.center.y.toFixed(1)}, ${obb.center.z.toFixed(1)})`);
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
        console.log(`Total collision OBBs: ${collisionOBBs.length}`);

        // Test collision at current position
        const hasCollision = checkHorizontalCollisionOBB(camera.position);
        console.log(`OBB collision at current position: ${hasCollision}`);

        // Test head collision
        const headCheck = checkVerticalCollisionOBB(
            new THREE.Vector3(camera.position.x, camera.position.y + playerHeight, camera.position.z),
            'up'
        );
        console.log(`Head collision test: ${headCheck.collision}`);
    }
});

if (document.getElementById("cameraView")) {
    document.getElementById("cameraView").addEventListener("change", (e) => {
        if (e.target.value === "orbit") activateOrbitControls();
        if (e.target.value === "fps") activateFPSControls();
    });
}

// --------------------- GLTF Loader with FIXED OBB Collision Detection ---------------------
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

        // Wait a frame for transformations to apply, then setup FIXED OBB collision detection
        requestAnimationFrame(() => {
            console.log('Setting up FIXED OBB collision detection...');

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
                    // Method 3: Auto-detect large static meshes (but skip transparent materials)
                    else if (child.geometry && child.material) {
                        // Skip transparent materials to avoid alpha collision issues
                        const isTransparent = child.material.transparent ||
                            child.material.opacity < 1 ||
                            (child.material.map && child.material.map.format === THREE.RGBAFormat);

                        if (true) {
                            const meshBox = new THREE.Box3().setFromObject(child);
                            const size = meshBox.getSize(new THREE.Vector3());

                            // If object is large enough and not likely to be a small detail, treat as collidable
                            
                                shouldAddToCollision = true;
                                console.log(`Added auto-detected mesh: ${child.name || 'unnamed'} (size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)})`);

                        }
                    }

                    if (shouldAddToCollision) {
                        addToOBBCollision(child);
                    }
                }
            });

            console.log(`FIXED OBB setup complete. Total collision OBBs: ${collisionOBBs.length}`);

            // List all collision OBBs for debugging
            console.log('Collision OBBs:');
            collisionOBBs.forEach((obb, index) => {
                const size = new THREE.Vector3(obb.extents.x * 2, obb.extents.y * 2, obb.extents.z * 2);
                console.log(`  ${index}: center (${obb.center.x.toFixed(1)}, ${obb.center.y.toFixed(1)}, ${obb.center.z.toFixed(1)}) size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`);
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

// --------------------- Animation Loop with FIXED OBB Collision ---------------------
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (activeControls === fpsControls) {
        // Update player OBB position
        updatePlayerOBB();

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

        // Apply collision-aware horizontal movement using FIXED OBB
        const validPos = getValidMovementOBB(currentPos, desiredPos);
        camera.position.copy(validPos);

        // Enhanced gravity and vertical collision using FIXED OBB
        verticalVelocity += gravity * delta;

        // Calculate next vertical position
        const nextY = camera.position.y + verticalVelocity * delta;
        const nextPos = new THREE.Vector3(camera.position.x, nextY, camera.position.z);

        // Check vertical collision based on movement direction
        if (verticalVelocity > 0) {
            // Moving up (jumping) - check head collision
            const upCheck = checkVerticalCollisionOBB(nextPos, 'up');
            if (upCheck.collision) {
                // Hit ceiling/roof - stop upward movement
                verticalVelocity = 0;
                camera.position.y = upCheck.height - playerHeight - 0.1;
                console.log('Head hit ceiling at Y:', upCheck.height);
            } else {
                camera.position.y = nextY;
            }
        } else {
            // Moving down (falling) - check ground collision
            const downCheck = checkVerticalCollisionOBB(nextPos, 'down');
            if (downCheck.collision) {
                // Hit ground/floor
                verticalVelocity = 0;
                canJump = true;
                camera.position.y = downCheck.height;
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
    } else {
        orbitControls.update();
    }

    renderer.render(scene, camera);
}

// Start animation loop
animate();

// --------------------- Helper Functions for Manual Setup ---------------------

// Function to manually add collision objects (call this from console)
window.addOBBCollision = function (objectName) {
    const object = scene.getObjectByName(objectName);
    if (object && object.isMesh) {
        addToOBBCollision(object);
        console.log(`Manually added ${objectName} to FIXED OBB collision detection`);
    } else {
        console.log(`Object ${objectName} not found or is not a mesh`);
    }
};

// Function to remove collision objects
window.removeOBBCollision = function (objectName) {
    const object = scene.getObjectByName(objectName);
    if (object) {
        const index = collisionOBBs.findIndex(obb => {
            // Find OBB that matches this object's world position
            const objectBox = new THREE.Box3().setFromObject(object);
            const objectCenter = objectBox.getCenter(new THREE.Vector3());
            return obb.center.distanceTo(objectCenter) < 0.1;
        });

        if (index !== -1) {
            collisionOBBs.splice(index, 1);
            console.log(`Removed ${objectName} from FIXED OBB collision detection`);

            // Remove debug mesh if exists
            if (debugMeshes[index]) {
                scene.remove(debugMeshes[index]);
                debugMeshes.splice(index, 1);
            }
        }
    } else {
        console.log(`Object ${objectName} not found`);
    }
};

// Function to clear all collision objects
window.clearAllOBBCollisions = function () {
    collisionOBBs.length = 0;
    console.log('All FIXED OBB collision objects cleared');

    // Remove debug visualizations
    debugMeshes.forEach(mesh => scene.remove(mesh));
    debugMeshes.length = 0;
};

// Function to list all collision objects
window.listOBBCollisions = function () {
    console.log(`Total FIXED OBB collision objects: ${collisionOBBs.length}`);
    collisionOBBs.forEach((obb, index) => {
        const size = new THREE.Vector3(obb.extents.x * 2, obb.extents.y * 2, obb.extents.z * 2);
        const rotation = new THREE.Vector3(obb.rotation.x, obb.rotation.y, obb.rotation.z);
        console.log(`${index}: center (${obb.center.x.toFixed(1)}, ${obb.center.y.toFixed(1)}, ${obb.center.z.toFixed(1)}) - size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} - rotation: (${rotation.x.toFixed(2)}, ${rotation.y.toFixed(2)}, ${rotation.z.toFixed(2)})`);
    });
};

// Function to test collision at specific position
window.testOBBCollisionAt = function (x, y, z) {
    const testPos = new THREE.Vector3(x, y, z);
    const hasCollision = checkHorizontalCollisionOBB(testPos);
    console.log(`FIXED OBB collision at (${x}, ${y}, ${z}): ${hasCollision}`);
    return hasCollision;
};

// Add helper functions for debugging
window.testOBBHeadCollision = function () {
    const headCheck = checkVerticalCollisionOBB(
        new THREE.Vector3(camera.position.x, camera.position.y + playerHeight, camera.position.z),
        'up'
    );
    console.log('FIXED OBB head collision test:', headCheck);
};

window.testOBBJump = function () {
    console.log('Testing FIXED OBB collision with jump...');
    verticalVelocity = 10;
    canJump = false;
};

// Function to test and compare OBB creation methods
window.debugOBBCreation = function (meshName) {
    const mesh = scene.getObjectByName(meshName);
    if (!mesh || !mesh.isMesh) {
        console.log(`Mesh ${meshName} not found`);
        return;
    }

    console.log('=== DEBUGGING OBB CREATION ===');
    console.log('Mesh:', meshName);
    console.log('Position:', mesh.position);
    console.log('Rotation:', mesh.rotation);
    console.log('Scale:', mesh.scale);

    // Test the FIXED OBB creation
    const fixedOBB = OBB.fromMesh(mesh);
    console.log('FIXED OBB Result:', fixedOBB);

    // Create debug visualization
    const debugMesh = fixedOBB.createDebugMesh(0x00ff00, 0.8);
    scene.add(debugMesh);
    console.log('Added green debug visualization');

    return fixedOBB;
};