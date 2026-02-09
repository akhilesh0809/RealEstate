import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/* --- CONFIGURATION --- */
const EYE_HEIGHT_DESKTOP = 1.7; 
const LERP_SPEED = 0.1; 
const MOVE_SPEED = 0.15; 

const locations = {
    "Ground Floor": { x: -19.24, y: -0.24, z: 58.78 },
    "Living / TV Area": { x: -22.08, y: 4.67, z: 44.02 },
    "Dining Hall": { x: -18.41, y: 4.66, z: 28.42 },
    "First Floor": { x: -20.38, y: 4.65, z: 66.81 }, 
    "Master Bedroom": { x: -2.28, y: 4.66, z: 54.97 },
    "Washroom": { x: -1.21, y: 4.66, z: 46.55 }
};

/* CORE SETUP */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// --- VR RIG SETUP ---
const userRig = new THREE.Group();
scene.add(userRig);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
userRig.add(camera);

// Initial Position
userRig.position.set(17.55, 0.00, 68.58);
camera.position.y = EYE_HEIGHT_DESKTOP; // Desktop offset

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true; // IMPORTANT
document.body.appendChild(renderer.domElement);

// Add VR Button
document.body.appendChild(VRButton.createButton(renderer));

const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 2.0);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 10, 7);
scene.add(sun);

/* --- VR CONTROLLERS & VISUALS --- */
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);

// Event Listeners for Trigger Press
controller1.addEventListener('select', onVRSelect);
controller2.addEventListener('select', onVRSelect);

userRig.add(controller1);
userRig.add(controller2);

// Visual Models (Hands/Controllers)
const controllerModelFactory = new XRControllerModelFactory();
const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
userRig.add(controllerGrip1);

const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
userRig.add(controllerGrip2);

// Laser Beams
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-5)]);
const laserLine = new THREE.Line(laserGeo);
laserLine.scale.z = 5;

const c1Line = laserLine.clone();
const c2Line = laserLine.clone();
controller1.add(c1Line);
controller2.add(c2Line);

// Teleport Marker (Reticle)
const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00f260 })
);
reticle.visible = false;
scene.add(reticle);

/* LOADERS */
const collidables = [];
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(dracoLoader);

loader.load('Scene-v1.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    model.traverse(n => {
        if(n.isMesh) {
            n.receiveShadow = true;
            collidables.push(n);
        }
    });
}, undefined, (err) => console.error("Error loading Scene.glb:", err));

/* STATE MANAGEMENT */
let yaw = 0, pitch = 0;
const rigTarget = new THREE.Vector3().copy(userRig.position);
let isMoving = false, isDragging = false;
const mouse = new THREE.Vector2();
const mouseDownPos = new THREE.Vector2();

// Raycasters
const raycaster = new THREE.Raycaster(); 
const tempMatrix = new THREE.Matrix4();

/* HELPER: Find floor height */
function getFloorY(x, z, currentY) {
    const origin = new THREE.Vector3(x, currentY + 2.0, z); 
    const direction = new THREE.Vector3(0, -1, 0); 
    const downRay = new THREE.Raycaster(origin, direction);
    const hits = downRay.intersectObjects(collidables);
    return hits.length > 0 ? hits[0].point.y : currentY; 
}

/* VR TELEPORT LOGIC */
function onVRSelect(event) {
    if (reticle.visible) {
        // Teleport Rig to the Reticle position
        rigTarget.set(reticle.position.x, reticle.position.y, reticle.position.z);
        isMoving = true;
    }
}

/* DESKTOP SIDEBAR LOGIC */
const sidebar = document.getElementById('ui-right');
Object.keys(locations).forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.innerText = name;
    btn.onclick = (e) => {
        e.stopPropagation(); 
        rigTarget.set(locations[name].x, locations[name].y, locations[name].z);
        isMoving = true;
    };
    sidebar.appendChild(btn);
});

/* INPUTS (Desktop) */
window.addEventListener('mousedown', (e) => { 
    if(e.target.closest('#ui-right')) return;
    isDragging = true; 
    mouseDownPos.set(e.clientX, e.clientY);
});

window.addEventListener('mouseup', (e) => {
    isDragging = false; 
    if(e.target.closest('#ui-right')) return;
    const moveDistance = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);

    if (moveDistance < 5 && !renderer.xr.isPresenting) {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(collidables);
        if (hits.length > 0) {
            const p = hits[0].point;
            const targetFloorY = getFloorY(p.x, p.z, userRig.position.y);
            rigTarget.set(p.x, targetFloorY, p.z);
            isMoving = true;
        }
    }
});

window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    if (isDragging && !renderer.xr.isPresenting) {
        isMoving = false;
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-1.5, Math.min(1.5, pitch));
        camera.rotation.set(pitch, yaw, 0);
    }
});

const keys = { w:0, a:0, s:0, d:0 };
window.onkeydown = (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = 1; };
window.onkeyup = (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = 0; };

/* MAIN LOOP */
renderer.setAnimationLoop(function () {
    
    // 1. VR Raycasting
    if (renderer.xr.isPresenting) {
        reticle.visible = false;

        // Check Controller 1 (Right hand usually)
        tempMatrix.identity().extractRotation(controller1.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const hits = raycaster.intersectObjects(collidables);
        if (hits.length > 0) {
            reticle.visible = true;
            reticle.position.copy(hits[0].point);
        }
    }

    // 2. Smooth Movement
    if (isMoving) {
        userRig.position.lerp(rigTarget, LERP_SPEED);
        if (userRig.position.distanceTo(rigTarget) < 0.05) isMoving = false;
    }

    // 3. Desktop WASD
    if (!renderer.xr.isPresenting && (keys.w || keys.a || keys.s || keys.d)) {
        isMoving = false;
        const forward = new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
        const right = new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
        const moveVec = new THREE.Vector3();
        if (keys.w) moveVec.add(forward);
        if (keys.s) moveVec.add(forward.negate());
        if (keys.a) moveVec.add(right.negate());
        if (keys.d) moveVec.add(right);
        moveVec.normalize().multiplyScalar(MOVE_SPEED);
        userRig.position.x += moveVec.x;
        userRig.position.z += moveVec.z;
        
        // Floor Snap
        const correctY = getFloorY(userRig.position.x, userRig.position.z, userRig.position.y);
        userRig.position.y = THREE.MathUtils.lerp(userRig.position.y, correctY, 0.2);
        rigTarget.copy(userRig.position);
    }

    // 4. VR/Desktop Camera Height Adjustment
    if(renderer.xr.isPresenting) {
        camera.position.y = 0; 
    } else {
        camera.position.y = EYE_HEIGHT_DESKTOP;
    }

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});