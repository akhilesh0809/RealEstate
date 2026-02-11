import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

/* --- CONFIGURATION --- */
const EYE_HEIGHT_DESKTOP = 1.7; 
const LERP_SPEED = 0.005; 
const MOVE_SPEED = 0.05; 

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

const userRig = new THREE.Group();
scene.add(userRig);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
userRig.add(camera);

userRig.position.set(17.55, 0.00, 68.58);
camera.position.y = EYE_HEIGHT_DESKTOP;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true; 
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 2.0);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 10, 7);
scene.add(sun);

/* --- BLUE SPHERE MARKER --- */
const markerGeo = new THREE.SphereGeometry(0.2, 16, 16);
const markerMat = new THREE.MeshBasicMaterial({ color: 0x0077ff, transparent: true, opacity: 0.7 });
const marker = new THREE.Mesh(markerGeo, markerMat);
marker.visible = false;
scene.add(marker);

/* --- VR CONTROLLERS --- */
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
controller1.addEventListener('select', onVRSelect);
controller2.addEventListener('select', onVRSelect);
userRig.add(controller1, controller2);

const controllerModelFactory = new XRControllerModelFactory();
const grip1 = renderer.xr.getControllerGrip(0);
grip1.add(controllerModelFactory.createControllerModel(grip1));
userRig.add(grip1);

const grip2 = renderer.xr.getControllerGrip(1);
grip2.add(controllerModelFactory.createControllerModel(grip2));
userRig.add(grip2);

const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.15, 32).rotateX(-Math.PI / 2),
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
    scene.add(gltf.scene);
    gltf.scene.traverse(n => {
        if(n.isMesh) {
            n.receiveShadow = true;
            collidables.push(n);
        }
    });
}, undefined, (err) => console.error(err));

/* STATE */
let yaw = 0; 
const rigTarget = new THREE.Vector3().copy(userRig.position);
let isMoving = false, isDragging = false;
const mouse = new THREE.Vector2();
const mouseDownPos = new THREE.Vector2();
const raycaster = new THREE.Raycaster(); 
const tempMatrix = new THREE.Matrix4();

function getFloorY(x, z, currentY) {
    const downRay = new THREE.Raycaster(new THREE.Vector3(x, currentY + 2.0, z), new THREE.Vector3(0, -1, 0));
    const hits = downRay.intersectObjects(collidables);
    return hits.length > 0 ? hits[0].point.y : currentY; 
}

function onVRSelect() {
    if (reticle.visible) {
        rigTarget.copy(reticle.position);
        marker.position.copy(rigTarget);
        marker.visible = true;
        isMoving = true;
    }
}

/* UI SIDEBAR */
const sidebar = document.getElementById('ui-right');
if (sidebar) {
    Object.keys(locations).forEach(name => {
        const btn = document.createElement('button');
        btn.innerText = name;
        btn.onclick = (e) => {
            e.stopPropagation(); 
            rigTarget.set(locations[name].x, locations[name].y, locations[name].z);
            marker.position.copy(rigTarget);
            marker.visible = true;
            isMoving = true;
        };
        sidebar.appendChild(btn);
    });
}

/* DESKTOP & MOBILE INPUTS */
const handleMoveStart = (x, y) => {
    isDragging = true;
    mouseDownPos.set(x, y);
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;
};

const handleMoveEnd = (x, y) => {
    isDragging = false;
    const dist = Math.hypot(x - mouseDownPos.x, y - mouseDownPos.y);
    if (dist < 10 && !renderer.xr.isPresenting) {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(collidables);
        if (hits.length > 0) {
            const p = hits[0].point;
            rigTarget.set(p.x, getFloorY(p.x, p.z, userRig.position.y), p.z);
            marker.position.copy(rigTarget);
            marker.visible = true;
            isMoving = true;
        }
    }
};

window.addEventListener('mousedown', e => { if(!e.target.closest('#ui-right')) handleMoveStart(e.clientX, e.clientY); });
window.addEventListener('mouseup', e => { if(!e.target.closest('#ui-right')) handleMoveEnd(e.clientX, e.clientY); });
window.addEventListener('mousemove', e => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    if (isDragging && !renderer.xr.isPresenting) {
        isMoving = false;
        yaw -= e.movementX * 0.002;
        camera.rotation.set(0, yaw, 0);
    }
});

// Mobile specific
window.addEventListener('touchstart', e => { 
    const t = e.touches[0];
    if(!e.target.closest('#ui-right')) handleMoveStart(t.clientX, t.clientY);
}, { passive: false });

window.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    if(!e.target.closest('#ui-right')) handleMoveEnd(t.clientX, t.clientY);
});

window.addEventListener('touchmove', e => {
    if (!isDragging || renderer.xr.isPresenting) return;
    const t = e.touches[0];
    const moveX = t.clientX - mouseDownPos.x;
    yaw -= moveX * 0.005;
    camera.rotation.set(0, yaw, 0);
    mouseDownPos.set(t.clientX, t.clientY);
    isMoving = false;
}, { passive: false });

const keys = { w:0, a:0, s:0, d:0 };
window.onkeydown = (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = 1; };
window.onkeyup = (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = 0; };

/* MAIN LOOP */
renderer.setAnimationLoop((time) => {
    if (marker.visible) {
        marker.scale.setScalar(1 + Math.sin(time * 0.01) * 0.1);
    }

    if (renderer.xr.isPresenting) {
        reticle.visible = false;
        tempMatrix.identity().extractRotation(controller1.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        const hits = raycaster.intersectObjects(collidables);
        if (hits.length > 0) {
            reticle.visible = true;
            reticle.position.copy(hits[0].point);
        }
    }

    if (isMoving) {
        userRig.position.lerp(rigTarget, LERP_SPEED);
        if (userRig.position.distanceTo(rigTarget) < 0.1) {
            isMoving = false;
            marker.visible = false;
        }
    }

    if (!renderer.xr.isPresenting && (keys.w || keys.a || keys.s || keys.d)) {
        isMoving = false; marker.visible = false;
        const forward = new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
        const right = new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
        const moveVec = new THREE.Vector3();
        if (keys.w) moveVec.add(forward);
        if (keys.s) moveVec.add(forward.negate());
        if (keys.a) moveVec.add(right.negate());
        if (keys.d) moveVec.add(right);
        moveVec.normalize().multiplyScalar(MOVE_SPEED);
        userRig.position.add(moveVec);
        userRig.position.y = THREE.MathUtils.lerp(userRig.position.y, getFloorY(userRig.position.x, userRig.position.z, userRig.position.y), 0.2);
        rigTarget.copy(userRig.position);
    }

    camera.position.y = renderer.xr.isPresenting ? 0 : EYE_HEIGHT_DESKTOP;
    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
