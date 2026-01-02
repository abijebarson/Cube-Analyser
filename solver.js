export class Solver {
    constructor() {
        this.initialized = false;
        if (typeof Cube !== 'undefined') this.init();
    }

    init() {
        if (this.initialized) return;
        
        if (typeof Cube === 'undefined') {
            console.warn("Solver: Cube.js library not found during init.");
            return;
        }

        try {
            if (typeof Cube.initSolver === 'function') {
                Cube.initSolver();
                this.initialized = true;
                console.log("Solver: Engine initialized.");
            } else {
                console.warn("Solver: Cube.initSolver function missing.");
            }
        } catch (e) {
            console.error("Solver: Initialization failed.", e);
        }
    }

    solve(facelets) {
        if (typeof Cube === 'undefined') return "Error: Cube.js library not loaded.";
        
        if (!this.initialized) {
            this.init();
            if (!this.initialized) return "Error: Solver failed to initialize tables.";
        }

        try {
            const cube = Cube.fromString(facelets);
            
            const solution = cube.solve();
            
            return solution;
        } catch (e) {
            console.error("Solver Exception:", e);
            return "Error: " + e.message;
        }
    }
}