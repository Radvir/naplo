/**
 * The math behind everything: https://youtu.be/jvPPXbo87ds
 *
 * Compile: `esbuild --outfile=../svg-graph.js`
 * Watch: `nodemon index.ts --exec esbuild --outfile=../svg-graph.js`
 */

/// CONSTANTS
const CARDINAL_TRESHOLD = 3;
const TENSION = 0.35;

/// UTIL
type Ponthatar = { [key: string]: number };
type Point = { x: number; y: number };

// simple linear interpolation
function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
}

// pad x & y and flip y axis
function pointToString(p: Point) {
    return `${(10 + p.x).toFixed(2)},${(110 - p.y).toFixed(2)}`;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/**
 * Draw a cubic bézier curve from `a` to `b`
 * @returns stringified svg polyline points of the curve
 */
function cubicBézier(a: Point, c1: Point, c2: Point, b: Point): string {
    let t = 0;
    const step = 0.01;
    const points = [] as Point[];
    while (t <= 1) {
        points.push(calcBézierPoint(a, c1, c2, b, t));
        t += step;
    }
    return points.map((x) => pointToString(x)).join(" ");
}

function calcBézierPoint(a: Point, c1: Point, c2: Point, b: Point, t: number): Point {
    // still faster than recursive lerp
    const x = Math.pow(1 - t, 3) * a.x + Math.pow(1 - t, 2) * 3 * t * c1.x + 3 * t * t * (1 - t) * c2.x + Math.pow(t, 3) * b.x;
    const y = Math.pow(1 - t, 3) * a.y + Math.pow(1 - t, 2) * 3 * t * c1.y + 3 * t * t * (1 - t) * c2.y + Math.pow(t, 3) * b.y;
    return { x, y };
}

/**
 * Calculate control points using 2 adjacent points to connect
 * Creates a cardinal or "square" spline, depending on the slope
 * angle in order to avoid the spline "overshooting" due to the
 * mirrored control point (not C1 continious)
 * @param v0 the point before targ
 * @param v1 the point after targ
 * @param targ point to calculate control points for
 * @param tension scale control point vectors
 * @param treshold max y/x ratio
 * @returns {[Point, Point]} the control points for targ
 */
function controlPointsFromVector(v0: Point, v1: Point, targ: Point, tension = TENSION, treshold = CARDINAL_TRESHOLD): [Point, Point] {
    // calculate the cardinal points
    const x = ((v1.x - v0.x) * tension) / 3 + targ.x;
    const y = ((v1.y - v0.y) * tension) / 3 + targ.y;

    let c0 = reflect({ x, y }, targ),
        c1 = { x, y };

    // check c0 slope
    const v0Ratio = Math.abs(v0.y - targ.y) / Math.abs(v0.x - targ.x);
    if (v0Ratio > CARDINAL_TRESHOLD) {
        c0 = { x: v0.x, y: targ.y };
        c1 = reflect(c0, targ);
    }

    // check c1 slope
    const v1Ratio = Math.abs(v1.y - targ.y) / Math.abs(v1.x - targ.x);
    if (v1Ratio > CARDINAL_TRESHOLD) {
        c1 = { x: v1.x, y: targ.y };
        c0 = reflect(c1, targ);
    }

    return [c0, c1];
}

/**
 * Reflects `a` point to `center` point
 */
function reflect(a: Point, center: Point): Point {
    return {
        x: 2 * center.x - a.x,
        y: 2 * center.y - a.y,
    };
}

/**
 * This function assumes there is an `svg#svg-container`, with attribute `viewBox="0 0 120 120"` in the document
 */
function drawGraph(ponthatar: Ponthatar, IQR: number[], id = "svg-graph") {
    const svg = document.getElementById(id) as any as SVGElement;
    if (!svg) throw `Unable to draw graph! No element with id "${id}"`;

    /*
     * DRAW FRAME
     */
    svg.innerHTML += `<rect x="9" y="9" width="26" height="102" style="fill:#11111122;stroke:none;" />`;
    svg.innerHTML += `<rect x="85" y="9" width="26" height="102" style="fill:#11111122;stroke:none;" />`;
    svg.innerHTML += `<rect x="9" y="9" width="102" height="102" style="fill:none;stroke-width:0.4;stroke:black;" />`;

    for (const disp in ponthatar) {
        const y = 110 - ponthatar[disp];
        svg.innerHTML += `<line x1="9" y1="${y}" x2="111" y2="${y}" style="stroke:${disp.length > 1 ? "#111" : "#666"};stroke-width:${
            disp.length > 1 ? "0.05" : "0.2"
        };"/>`;
        // left one
        svg.innerHTML += `<text x="22" y="${y - 1}" style="font:${disp.length > 1 ? "2.5px" : "4px"} serif;" text-anchor="middle" fill="blue">${disp}</text>`;
        // right
        svg.innerHTML += `<text x="98" y="${y - 1}" style="font:${disp.length > 1 ? "2.5px" : "4px"} serif;" text-anchor="middle" fill="blue">${
            ponthatar[disp]
        }%</text>`;
    }

    /*
     * DRAW THE SPLINE
     */

    // Get IQR points (curves will connect here)
    const joints: Point[] = [];
    const dist = 50 / (IQR.length - 1);
    for (let i = 0; i < IQR.length; i++) {
        const p: Point = { x: 25 + i * dist, y: 100 * IQR[i] };
        joints.push(p);
        // DEBUG, shows IQR points
        // svg.innerHTML += `<circle cx="${p.x}" cy="${100 - p.y + 10}" r="0.5" fill="red" />`;
    }

    // calculate the first and last point
    const cFirst = lerpPoint(joints[0], joints[1], 0.3);
    const cLast = lerpPoint(joints[joints.length - 1], joints[joints.length - 2], 0.3);
    const controlPoints = [cFirst] as Point[];

    // spline control points
    for (let i = 1; i < joints.length - 1; i++) {
        const [c0, c1] = controlPointsFromVector(joints[i - 1], joints[i + 1], joints[i]);
        controlPoints.push(c0, c1);
        // DEBUG, draws control lines
        // svg.innerHTML += `<polyline points="${c0.x},${110 - c0.y} ${joints[i].x},${110 - joints[i].y} ${c1.x},${110 - c1.y}" style="stroke:red;stroke-width:0.2;fill:none;" />`;
    }
    controlPoints.push(cLast);

    // draw the spline (the whole spline is one polyline object, may be visibly disconnected if not)
    let keypoints = "";
    for (let i = 0; i < joints.length - 1; i++) keypoints += cubicBézier(joints[i], controlPoints[i * 2], controlPoints[i * 2 + 1], joints[i + 1]) + " ";
    svg.innerHTML += `<polyline points="${keypoints}" style="fill:none;stroke:red;stroke-width:0.4" />`;
}
