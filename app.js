import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { Solver } from './solver.js';

const SETTINGS_KEY = 'rubiks_app_settings';
let storedSettings = {};
try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) storedSettings = JSON.parse(raw);
} catch (e) {
    localStorage.removeItem(SETTINGS_KEY);
}

const DEFAULT_SETTINGS = {
    showLabels: false,
    gap: 0,
    speed: 0.25,
    autoAccelerate: false,
    clickMode: 'Grey Out',
    centerSelection: false,
    enableClickMask: false
};

const currentSettings = { ...DEFAULT_SETTINGS, ...storedSettings };

const palette = {
    right: new THREE.Color(0xB90000), left: new THREE.Color(0xFF5900),
    top: new THREE.Color(0xFFD500), bottom: new THREE.Color(0xFFFFFF),
    front: new THREE.Color(0x009E60), back: new THREE.Color(0x0045AD),
    plastic: new THREE.Color(0x151515)
};

const faceConfig = [
    { pos: 'x', val: 1, text: 'R', color: '#FF8888', rot: [0, Math.PI/2, 0] },
    { pos: 'x', val: -1, text: 'L', color: '#FFCC88', rot: [0, -Math.PI/2, 0] },
    { pos: 'y', val: 1, text: 'U', color: '#FFFFEE', rot: [-Math.PI/2, 0, 0] },
    { pos: 'y', val: -1, text: 'D', color: '#AAAAAA', rot: [Math.PI/2, 0, 0] },
    { pos: 'z', val: 1, text: 'F', color: '#88FF88', rot: [0, 0, 0] },
    { pos: 'z', val: -1, text: 'B', color: '#8888FF', rot: [0, Math.PI, 0] }
];

const saveSlots = JSON.parse(localStorage.getItem('rubiks_save_slots') || '{}');
const mySolver = new Solver(); 

const scene = new THREE.Scene(); 
scene.background = new THREE.Color(0xf0f0f5);
scene.fog = new THREE.Fog(0xf0f0f5, 10, 40);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(6, 6, 8); camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
controls.enablePan = false; 

const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const dl = new THREE.DirectionalLight(0xffffff, 1.4); 
dl.position.set(12, 18, 12); 
dl.castShadow = true;
dl.shadow.radius = 16;
dl.shadow.bias = -0.0005;
dl.shadow.mapSize.width = 4096; 
dl.shadow.mapSize.height = 4096;
scene.add(dl);

const dl2 = new THREE.DirectionalLight(0xffffff, 0.7); dl2.position.set(-15, 8, 8); scene.add(dl2);
const dl3 = new THREE.DirectionalLight(0xffffff, 0.5); dl3.position.set(0, 10, -15); scene.add(dl3);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ opacity: 0.08 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -3.8; ground.receiveShadow = true;
scene.add(ground);

const mainMaterial = new THREE.MeshStandardMaterial({ 
    vertexColors: true, 
    roughness: 0.2, 
    metalness: 0.05 
});

let cubes = [], isAnimating = false, animationPivot = null, activeCubes = [];
let targetAngle = 0, currentAngle = 0, rotationAxis = 'x';
const moveQueue = [], undoStack = []; 

const moves = {
    'L': { axis: 'x', layer: -1, angle: Math.PI/2 }, 'l': { axis: 'x', layer: [-1, 0], angle: Math.PI/2 },
    'R': { axis: 'x', layer: 1, angle: -Math.PI/2 }, 'r': { axis: 'x', layer: [0, 1], angle: -Math.PI/2 },
    'U': { axis: 'y', layer: 1, angle: -Math.PI/2 }, 'u': { axis: 'y', layer: [0, 1], angle: -Math.PI/2 },
    'D': { axis: 'y', layer: -1, angle: Math.PI/2 }, 'd': { axis: 'y', layer: [-1, 0], angle: Math.PI/2 },
    'F': { axis: 'z', layer: 1, angle: -Math.PI/2 }, 'f': { axis: 'z', layer: [0, 1], angle: -Math.PI/2 },
    'B': { axis: 'z', layer: -1, angle: Math.PI/2 }, 'b': { axis: 'z', layer: [-1, 0], angle: Math.PI/2 },
    'M': { axis: 'x', layer: 0, angle: Math.PI/2 }, 'E': { axis: 'y', layer: 0, angle: Math.PI/2 },
    'S': { axis: 'z', layer: 0, angle: -Math.PI/2 },
    'x': { axis: 'x', layer: 'ALL', angle: -Math.PI/2 },
    'y': { axis: 'y', layer: 'ALL', angle: -Math.PI/2 },
    'z': { axis: 'z', layer: 'ALL', angle: -Math.PI/2 },
};
['x','y','z'].forEach(k => moves[k.toUpperCase()] = moves[k]);

function createCubeGroup() {
    cubes.forEach(c => { c.parent?.remove(c); c.geometry.dispose(); if(c.material!==mainMaterial) c.material.dispose(); });
    cubes = [];
    undoStack.length = 0; 
    if(animationPivot?.parent) animationPivot.parent.remove(animationPivot);
    for (let z=-1; z<=1; z++) for (let y=-1; y<=1; y++) for (let x=-1; x<=1; x++) {
        const mesh = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 8, 0.15), mainMaterial);
        mesh.userData = { gridPos: {x,y,z}, initialPos: {x,y,z} };
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.position.set(x, y, z);
        
        if (Math.abs(x) + Math.abs(y) + Math.abs(z) === 1) {
            const conf = faceConfig.find(f => (f.pos==='x' && x===f.val) || (f.pos==='y' && y===f.val) || (f.pos==='z' && z===f.val));
            if(conf) {
                mesh.userData.textColor = conf.color;
                updateLabelTexture(mesh, conf.text, conf.color);
            }
        }
        updateCubeColors(mesh);
        scene.add(mesh); cubes.push(mesh);
    }
}

function updateCubeColors(mesh) {
    const count = mesh.geometry.attributes.position.count;
    const normals = mesh.geometry.attributes.normal.array;
    const colors = [];
    const threshold = 0.9; 
    const show = !mesh.userData.forceGrey;
    const { x, y, z } = mesh.userData.initialPos;

    for (let i = 0; i < count; i++) {
        const nx = normals[i*3], ny = normals[i*3+1], nz = normals[i*3+2];
        let c = palette.plastic;
        if (show) {
            if (nx > threshold && x === 1) c = palette.right;
            else if (nx < -threshold && x === -1) c = palette.left;
            else if (ny > threshold && y === 1) c = palette.top;
            else if (ny < -threshold && y === -1) c = palette.bottom;
            else if (nz > threshold && z === 1) c = palette.front;
            else if (nz < -threshold && z === -1) c = palette.back;
        }
        colors.push(c.r, c.g, c.b);
    }
    mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function updateLabelTexture(mesh, text, color) {
    if (mesh.userData.labelMesh) {
        mesh.userData.labelMesh.visible = (window.guiParams?.showLabels ?? currentSettings.showLabels);
        
        if (mesh.userData.labelText !== text) {
            const texture = mesh.userData.labelMesh.material.map;
            const canvas = texture.image;
            const ctx = canvas.getContext('2d');
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = color; 
            ctx.font = 'bold 80px Arial'; 
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 64, 64);
            
            texture.needsUpdate = true;
            mesh.userData.labelText = text;
        }
        return;
    }
    
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color; ctx.font = 'bold 80px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    const d = 0.51, { x, y, z } = mesh.userData.initialPos;
    const conf = faceConfig.find(f => (f.pos==='x' && x===f.val) || (f.pos==='y' && y===f.val) || (f.pos==='z' && z===f.val));
    if(conf) {
        if(conf.pos === 'x') label.position.set(conf.val * d, 0, 0);
        if(conf.pos === 'y') label.position.set(0, conf.val * d, 0);
        if(conf.pos === 'z') label.position.set(0, 0, conf.val * d);
        label.rotation.set(...conf.rot);
    }
    label.visible = currentSettings.showLabels;
    mesh.add(label); 
    mesh.userData.labelMesh = label;
    mesh.userData.labelText = text;
}

function updateLabels() {
    cubes.forEach(c => {
        if(c.userData.textColor) {
            const {x, y, z} = c.userData.gridPos;
            const conf = faceConfig.find(f => (f.pos==='x' && x===f.val) || (f.pos==='y' && y===f.val) || (f.pos==='z' && z===f.val));
            if(conf) updateLabelTexture(c, conf.text, c.userData.textColor);
        }
    });
}

function runSequence(sequence) {
    if (sequence.length === 0) return;
    undoStack.push(sequence.map(m => ({...m})));
    if (undoStack.length > 20) undoStack.shift(); 
    sequence.forEach(m => moveQueue.push(m));
}

function parseAndRun(str) {
    const regex = /([RLUDFBEMSxyzrludfbXYZ])(w)?\s*('|2)?/g; 
    let m, batch = [];
    while ((m = regex.exec(str)) !== null) {
        let base = m[2] ? m[1].toLowerCase() : m[1];
        let mult = m[3] === "'" ? -1 : (m[3] === "2" ? 2 : 1);
        batch.push({ key: base, mult: mult });
    }
    runSequence(batch);
}

function startMove(key, mult = 1) {
    if(isAnimating || !moves[key]) return;
    isAnimating = true;
    const m = moves[key];
    rotationAxis = m.axis;
    targetAngle = m.angle * mult;
    currentAngle = 0;
    animationPivot = new THREE.Object3D();
    scene.add(animationPivot);
    activeCubes = cubes.filter(c => {
        if (m.layer === 'ALL') return true;
        const pos = c.userData.gridPos[m.axis];
        return Array.isArray(m.layer) ? m.layer.includes(pos) : pos === m.layer;
    });
    activeCubes.forEach(c => animationPivot.attach(c));
}

function getCubeState() {
    const getColorChar = (v) => {
        const absX=Math.abs(v.x), absY=Math.abs(v.y), absZ=Math.abs(v.z);
        if (absX>absY && absX>absZ) return v.x > 0 ? 'R' : 'L'; 
        if (absY>absX && absY>absZ) return v.y > 0 ? 'U' : 'D'; 
        if (absZ>absX && absZ>absY) return v.z > 0 ? 'F' : 'B'; 
        return '?';
    };
    
    let fullState = "";
    ['U','R','F','D','L','B'].forEach(faceName => {
        const coords = [];
        if(faceName==='U') for(let z=-1; z<=1; z++) for(let x=-1; x<=1; x++) coords.push({x,y:1,z});
        if(faceName==='R') for(let y=1; y>=-1; y--) for(let z=1; z>=-1; z--) coords.push({x:1,y,z});
        if(faceName==='F') for(let y=1; y>=-1; y--) for(let x=-1; x<=1; x++) coords.push({x,y,z:1});
        if(faceName==='D') for(let z=1; z>=-1; z--) for(let x=-1; x<=1; x++) coords.push({x,y:-1,z});
        if(faceName==='L') for(let y=1; y>=-1; y--) for(let z=-1; z<=1; z++) coords.push({x:-1,y,z});
        if(faceName==='B') for(let y=1; y>=-1; y--) for(let x=1; x>=-1; x--) coords.push({x,y,z:-1});

        coords.forEach(pos => {
            const cube = cubes.find(c => Math.round(c.userData.gridPos.x)===pos.x && Math.round(c.userData.gridPos.y)===pos.y && Math.round(c.userData.gridPos.z)===pos.z);
            if(cube) {
                const globalNormal = new THREE.Vector3();
                if(faceName==='U') globalNormal.set(0,1,0); if(faceName==='R') globalNormal.set(1,0,0);
                if(faceName==='F') globalNormal.set(0,0,1); if(faceName==='D') globalNormal.set(0,-1,0);
                if(faceName==='L') globalNormal.set(-1,0,0); if(faceName==='B') globalNormal.set(0,0,-1);
                const localNormal = globalNormal.clone().applyQuaternion(cube.quaternion.clone().invert());
                fullState += getColorChar(localNormal);
            }
        });
    });
    return fullState;
}

document.getElementById('runBtn').onclick = () => parseAndRun(document.getElementById('algoInput').value);
document.getElementById('shuffleBtn').onclick = () => {
    const k=['L','R','U','D','F','B'], s=['',"2","'"];
    const batch = [];
    for(let i=0; i<20; i++) batch.push({ key: k[Math.floor(Math.random()*6)], mult: s[Math.floor(Math.random()*3)]==="'"?-1:(s[Math.floor(Math.random()*3)]==="2"?2:1) });
    runSequence(batch);
};
document.getElementById('resetBtn').onclick = () => { isAnimating=false; moveQueue.length=0; createCubeGroup(); };
document.getElementById('undoBtn').onclick = () => {
    if (isAnimating || moveQueue.length > 0 || undoStack.length === 0) return;
    const lastSeq = undoStack.pop();
    const undoSeq = lastSeq.reverse().map(m => ({key: m.key, mult: -m.mult}));
    window.guiParams.isUndoing = true;
    undoSeq.forEach(m => moveQueue.push(m));
};
document.getElementById('solveBtn').onclick = () => {
    const state = getCubeState();
    const result = mySolver.solve(state);

    if (result && result.startsWith("Error")) {
        console.log(result);
    } else if (result) {
        document.getElementById('algoInput').value = result;
        parseAndRun(result);
    } else {
        console.log("Solver: No moves needed.");
    }
};

let controlState = 0; 
document.getElementById('toggleRotPanelBtn').onclick = function() {
    controlState = (controlState + 1) % 3;
    const qa = document.getElementById('quickActions'), rp = document.getElementById('rotationPanel'), btn = this;
    qa.classList.remove('visible'); rp.classList.remove('visible'); btn.classList.remove('active', 'mode-2');
    if (controlState === 1) { qa.classList.add('visible'); btn.classList.add('active'); } 
    else if (controlState === 2) { qa.classList.add('visible'); rp.classList.add('visible'); btn.classList.add('active', 'mode-2'); }
};
document.getElementById('algoInput').onkeypress = (e) => { if(e.key==='Enter') parseAndRun(e.target.value); };

const quickActions = document.getElementById('quickActions');
const standardMoves = ['R', 'L', 'U', 'D', 'F', 'B'];
const cubeRotations = ['x', 'y', 'z'];
standardMoves.forEach(key => {
    const btn = document.createElement('button'); btn.className = 'quick-btn'; btn.textContent = key;
    btn.onclick = () => runSequence([{key, mult: 1}]); quickActions.appendChild(btn);
});
const sep = document.createElement('div'); sep.className = 'separator'; quickActions.appendChild(sep);
cubeRotations.forEach(key => {
    const btn = document.createElement('button'); btn.className = 'quick-btn'; btn.textContent = key;
    btn.onclick = () => runSequence([{key, mult: 1}]); quickActions.appendChild(btn);
});

const faceRotGrid = document.getElementById('faceRotGrid');
['L','l','R','r', 'U','u','D','d', 'F','f','B','b', 'M','E','S'].forEach(key => {
    const btn = document.createElement('button'); btn.className = 'rot-btn'; btn.textContent = key;
    btn.onclick = () => runSequence([{key, mult: 1}]); faceRotGrid.appendChild(btn);
});
const cubeRotGrid = document.getElementById('cubeRotGrid');
['x','y','z'].forEach(key => {
    const btn = document.createElement('button'); btn.className = 'rot-btn'; btn.textContent = key;
    btn.onclick = () => runSequence([{key, mult: 1}]); cubeRotGrid.appendChild(btn);
});

let isDragging = false;
let dragStart = new THREE.Vector2();
let dragCube = null;
let dragNormal = null;
let dragIntersect = null;

createCubeGroup();

function initGui() {
    const gui = new GUI({ title: 'Settings', width: 220 });
    if(window.innerWidth < 600) gui.close();
    const params = {
        gap: currentSettings.gap,
        speed: currentSettings.speed,
        autoAccelerate: currentSettings.autoAccelerate,
        showLabels: currentSettings.showLabels,
        clickMode: currentSettings.clickMode,
        centerSelection: currentSettings.centerSelection,
        enableClickMask: currentSettings.enableClickMask,
        isUndoing: false,
        dimAll: () => { cubes.forEach(c => { const isCenter = (Math.abs(c.userData.initialPos.x)+Math.abs(c.userData.initialPos.y)+Math.abs(c.userData.initialPos.z)<=1); if (params.centerSelection || !isCenter) c.userData.isSelected = true; }); updateVisuals(); },
        highlightAll: () => { cubes.forEach(c => c.userData.isSelected = false); updateVisuals(); },
        highlightChanged: () => { cubes.forEach(c => { const isCenter = (Math.abs(c.userData.initialPos.x)+Math.abs(c.userData.initialPos.y)+Math.abs(c.userData.initialPos.z)<=1); const moved = (c.userData.gridPos.x!==c.userData.initialPos.x || c.userData.gridPos.y!==c.userData.initialPos.y || c.userData.gridPos.z!==c.userData.initialPos.z); if (params.centerSelection || !isCenter) c.userData.isSelected = !moved; }); updateVisuals(); }
    };
    
    function saveSettings() {
        const toSave = {
            gap: params.gap,
            speed: params.speed,
            autoAccelerate: params.autoAccelerate,
            showLabels: params.showLabels,
            clickMode: params.clickMode,
            centerSelection: params.centerSelection,
            enableClickMask: params.enableClickMask
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
    }

    const updateVisuals = () => {
        cubes.forEach(c => {
            c.visible = true; c.userData.forceGrey = false;
            if(c.material !== mainMaterial) { c.material.dispose(); c.material = mainMaterial; }
            const isCenter = (Math.abs(c.userData.initialPos.x)+Math.abs(c.userData.initialPos.y)+Math.abs(c.userData.initialPos.z)<=1);
            if(c.userData.isSelected && (params.centerSelection || !isCenter)) {
                if (params.clickMode === 'Hide') c.visible = false;
                else if (params.clickMode === 'Grey Out') c.userData.forceGrey = true;
                else if (params.clickMode === 'Wireframe') { c.material = mainMaterial.clone(); c.material.wireframe = true; }
            }
            c.geometry.attributes.color.needsUpdate = true; 
            updateCubeColors(c);
        });
    };

    gui.add(params, 'gap', 0, 1.0).onChange(() => {
        saveSettings();
        if(isAnimating) return;
        const s = 1 + params.gap;
        cubes.forEach(c => c.position.set(c.userData.gridPos.x * s, c.userData.gridPos.y * s, c.userData.gridPos.z * s));
    });
    gui.add(params, 'speed', 0.05, 1.0).onChange(saveSettings);
    gui.add(params, 'autoAccelerate').name('Auto Speedup').onChange(saveSettings);
    gui.add(params, 'showLabels').onChange(() => {
        saveSettings();
        cubes.forEach(c => { if(c.userData.labelMesh) c.userData.labelMesh.visible = params.showLabels; });
    });
    
    const fInt = gui.addFolder('Interaction');
    fInt.add(params, 'enableClickMask').name('Masking Enabled').onChange(saveSettings); 
    fInt.add(params, 'clickMode', ['Grey Out', 'Hide', 'Wireframe']).name('Effect').onChange((v) => { saveSettings(); updateVisuals(); });
    fInt.add(params, 'centerSelection').name('Mask Centers').onChange((v) => { saveSettings(); updateVisuals(); });
    fInt.add(params, 'dimAll').name('Mask All');
    fInt.add(params, 'highlightAll').name('Clear Mask');
    fInt.add(params, 'highlightChanged').name('Mask Solved');
    
    gui.close();
    
    window.guiParams = params;
    window.updateVisuals = updateVisuals;
}
initGui();

function animate() {
    requestAnimationFrame(animate);
    if(!isAnimating && moveQueue.length > 0) {
        const next = moveQueue.shift();
        startMove(next.key, next.mult);
    }

    if(isAnimating && animationPivot) {
        let speed = window.guiParams.speed;
        if((window.guiParams.autoAccelerate && moveQueue.length > 2) || window.guiParams.isUndoing) speed = 0.45;
        const step = targetAngle > 0 ? speed : -speed;
        if(Math.abs(targetAngle - currentAngle) < Math.abs(speed)) {
            animationPivot.rotation[rotationAxis] += (targetAngle - currentAngle);
            animationPivot.updateMatrixWorld();
            const s = 1 + window.guiParams.gap;
            activeCubes.forEach(c => {
                scene.attach(c);
                c.position.set(Math.round(c.position.x/s)*s, Math.round(c.position.y/s)*s, Math.round(c.position.z/s)*s);
                c.userData.gridPos = { x: Math.round(c.position.x/s), y: Math.round(c.position.y/s), z: Math.round(c.position.z/s) };
            });
            updateLabels(); 
            scene.remove(animationPivot); animationPivot = null; isAnimating = false;
            if(moveQueue.length === 0) window.guiParams.isUndoing = false;
        } else {
            animationPivot.rotation[rotationAxis] += step;
            currentAngle += step;
        }
    }
    controls.update(); renderer.render(scene, camera);
}
animate();
window.onresize = () => { camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };

window.addEventListener('pointerdown', (e) => {
    if(e.target.closest('#controls') || e.target.closest('.lil-gui') || e.target.closest('#rotationPanel')) return;
    
    const pointer = new THREE.Vector2((e.clientX/window.innerWidth)*2-1, -(e.clientY/window.innerHeight)*2+1);
    const raycaster = new THREE.Raycaster(); 
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(cubes);
    
    if(intersects.length > 0) {
        const obj = intersects[0].object;
        
        if (window.guiParams.enableClickMask) {
            const isCenter = (Math.abs(obj.userData.initialPos.x)+Math.abs(obj.userData.initialPos.y)+Math.abs(obj.userData.initialPos.z)<=1);
            if(window.guiParams.centerSelection || !isCenter) {
                obj.userData.isSelected = !obj.userData.isSelected;
                if(window.updateVisuals) window.updateVisuals();
            }
            controls.enabled = false;
            return;
        }

        if (!isAnimating) {
            isDragging = true;
            dragStart.set(e.clientX, e.clientY);
            dragCube = obj;
            dragIntersect = intersects[0].point;
            dragNormal = intersects[0].face.normal.clone().transformDirection(obj.matrixWorld).round();
            controls.enabled = false;
        }
    }
}, { capture: true });

function getScreenVector(worldVector, camera, originPoint) {
    const p1 = originPoint.clone().project(camera);
    const p2 = originPoint.clone().add(worldVector).project(camera);
    return new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize();
}

window.addEventListener('pointermove', (e) => {
    if (isDragging) e.preventDefault(); 
});

window.addEventListener('pointerup', (e) => {
    if (!isDragging || !dragCube) {
        isDragging = false;
        controls.enabled = true;
        dragCube = null;
        dragNormal = null;
        return;
    }

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
        isDragging = false;
        controls.enabled = true;
        dragCube = null;
        dragNormal = null;
        return;
    }

    const dragVec = new THREE.Vector2(dx, -dy).normalize(); 
    const absX = Math.abs(dragNormal.x);
    const absY = Math.abs(dragNormal.y);
    const absZ = Math.abs(dragNormal.z);

    const possibleMoves = [];

    const addCandidate = (axisVector, axisName, layerVal, tangentVec) => {
        const screenDir = getScreenVector(axisVector, camera, dragIntersect);
        const dot = dragVec.dot(screenDir);
        const alignment = Math.abs(dot);
        const screenTangent = getScreenVector(tangentVec, camera, dragIntersect);
        const tanDot = dragVec.dot(screenTangent);
        const dir = tanDot > 0 ? 1 : -1;
        possibleMoves.push({ axis: axisName, align: alignment, dir: dir, layer: layerVal });
    };

    const getMoveName = (axis, layer) => {
         if (axis === 'x') return layer === 1 ? 'R' : (layer === -1 ? 'L' : 'M');
         if (axis === 'y') return layer === 1 ? 'U' : (layer === -1 ? 'D' : 'E');
         if (axis === 'z') return layer === 1 ? 'F' : (layer === -1 ? 'B' : 'S');
    };

    if (absX > 0.5) {
        const tanY = dragNormal.x > 0 ? new THREE.Vector3(0,0,-1) : new THREE.Vector3(0,0,1);
        addCandidate(new THREE.Vector3(0, 0, 1), 'y', dragCube.userData.gridPos.y, tanY); 
        const tanZ = dragNormal.x > 0 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(0,-1,0);
        addCandidate(new THREE.Vector3(0, 1, 0), 'z', dragCube.userData.gridPos.z, tanZ);
    } 
    else if (absY > 0.5) {
        const tanX = dragNormal.y > 0 ? new THREE.Vector3(0,0,1) : new THREE.Vector3(0,0,-1);
        addCandidate(new THREE.Vector3(0, 0, 1), 'x', dragCube.userData.gridPos.x, tanX);
        const tanZ = dragNormal.y > 0 ? new THREE.Vector3(-1,0,0) : new THREE.Vector3(1,0,0);
        addCandidate(new THREE.Vector3(1, 0, 0), 'z', dragCube.userData.gridPos.z, tanZ);
    } 
    else if (absZ > 0.5) {
        const tanX = dragNormal.z > 0 ? new THREE.Vector3(0,-1,0) : new THREE.Vector3(0,1,0);
        addCandidate(new THREE.Vector3(0, 1, 0), 'x', dragCube.userData.gridPos.x, tanX);
        const tanY = dragNormal.z > 0 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(-1,0,0);
        addCandidate(new THREE.Vector3(1, 0, 0), 'y', dragCube.userData.gridPos.y, tanY);
    }

    possibleMoves.sort((a, b) => b.align - a.align);
    const best = possibleMoves[0];

    if (best && best.align > 0.5) {
        let moveKey = getMoveName(best.axis, best.layer);
        let mult = best.dir; 
        if (moveKey === 'R') mult *= -1; 
        if (moveKey === 'U') mult *= -1; 
        if (moveKey === 'F') mult *= -1; 
        if (moveKey === 'S') mult *= -1;
        startMove(moveKey, mult);
    }
    
    isDragging = false;
    controls.enabled = true;
    dragCube = null;
    dragNormal = null;
});