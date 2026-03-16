import * as d3 from 'd3';
import { Simulation, type CountryData } from './simulation';

export class MapRenderer {
    svg: any;
    g: any;
    path: any;
    projection: any;
    simulation: Simulation;
    selectedCountryId: string | null = null;
    originCountryId: string | null = null;

    onCountrySelect: ((country: CountryData) => void) | null = null;

    constructor(containerId: string, simulation: Simulation) {
        this.simulation = simulation;
        this.initMap(containerId);
    }

    async initMap(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const width = container.clientWidth;
        const height = container.clientHeight;

        this.svg = d3.select(container)
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("preserveAspectRatio", "xMidYMid meet");

        // Define arrow marker for infection routes
        this.svg.append("defs").append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "-0 -5 10 10")
            .attr("refX", 5)
            .attr("refY", 0)
            .attr("orient", "auto")
            .attr("markerWidth", 4)
            .attr("markerHeight", 4)
            .attr("xoverflow", "visible")
            .append("svg:path")
            .attr("d", "M 0,-5 L 10 ,0 L 0,5")
            .attr("fill", "#ff4444")
            .style("stroke", "none");

        this.g = this.svg.append("g");

        // Enable zooming
        const zoom = d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", (event) => {
                this.g.attr("transform", event.transform);
            });

        this.svg.call(zoom);

        // Mercator projection centered
        this.projection = d3.geoMercator()
            .scale(width / 2 / Math.PI)
            .translate([width / 2, height / 1.5]);

        this.path = d3.geoPath().projection(this.projection);

        await this.loadMapData();
    }

    async loadMapData() {
        try {
            // Load the amCharts GeoJSON data
            const res = await fetch('/data/worldLow.json');
            const worldData = await res.json();

            // Draw countries
            this.g.selectAll("path")
                .data(worldData.features)
                .enter()
                .append("path")
                .attr("d", this.path)
                .attr("class", "country")
                .attr("id", (d: any) => `country-${d.id}`)
                .attr("fill", "#21262d") // Base map color explicitly attached
                .on("click", (_event: any, d: any) => this.handleCountryClick(d.id))
                .append("title")
                .text((d: any) => d.properties.name);

            console.log("Map rendering complete");
        } catch (error) {
            console.error("Failed to load map data:", error);
        }
    }

    handleCountryClick(id: string) {
        this.selectedCountryId = id;

        // Highlight selection
        this.g.selectAll(".country").style("stroke", "");
        this.g.selectAll(".country").style("stroke-width", "");

        d3.select(`#country-${id}`)
            .style("stroke", "#58a6ff")
            .style("stroke-width", "1.5px");

        // Notify UI
        if (this.onCountrySelect) {
            const data = this.simulation.countries.get(id);
            if (data) this.onCountrySelect(data);
        }
    }

    setOrigin(id: string) {
        this.originCountryId = id;

        // Remove existing pins
        this.g.selectAll(".origin-pin").remove();

        const countryNode = this.g.select(`#country-${id}`).node();
        if (countryNode) {
            const centroid = this.path.centroid(countryNode.__data__);
            if (!isNaN(centroid[0]) && !isNaN(centroid[1])) {
                // Add pulsing circle
                const circle = this.g.append("circle")
                    .attr("class", "origin-pin")
                    .attr("cx", centroid[0])
                    .attr("cy", centroid[1])
                    .attr("r", 5)
                    .attr("fill", "var(--danger)")
                    .attr("opacity", 0.8);

                // Animation loop
                const pulse = () => {
                    circle.transition()
                        .duration(1000)
                        .attr("r", 15)
                        .attr("opacity", 0)
                        .transition()
                        .duration(0)
                        .attr("r", 5)
                        .attr("opacity", 0.8)
                        .on("end", pulse);
                };
                pulse();
            }
        }
    }

    drawInfectionRoute(sourceId: string, targetId: string) {
        const sourceNode = this.g.select(`#country-${sourceId}`).node();
        const targetNode = this.g.select(`#country-${targetId}`).node();

        if (sourceNode && targetNode) {
            const c1 = this.path.centroid(sourceNode.__data__);
            const c2 = this.path.centroid(targetNode.__data__);

            if (!isNaN(c1[0]) && !isNaN(c1[1]) && !isNaN(c2[0]) && !isNaN(c2[1])) {
                // Draw a curved line
                const dx = c2[0] - c1[0], dy = c2[1] - c1[1];
                const dr = Math.sqrt(dx * dx + dy * dy);

                const line = this.g.append("path")
                    .attr("class", "infection-route")
                    .attr("d", `M${c1[0]},${c1[1]}A${dr},${dr} 0 0,1 ${c2[0]},${c2[1]}`)
                    .attr("fill", "none")
                    .attr("stroke", "#ff4444")
                    .attr("stroke-width", 2)
                    .attr("opacity", 0.8)
                    .attr("marker-end", "url(#arrowhead)");

                const totalLength = line.node().getTotalLength();

                line
                    .attr("stroke-dasharray", totalLength + " " + totalLength)
                    .attr("stroke-dashoffset", totalLength)
                    .transition()
                    .duration(800)
                    .ease(d3.easeLinear)
                    .attr("stroke-dashoffset", 0)
                    .transition()
                    .duration(1000)
                    .attr("opacity", 0)
                    .remove(); // Cleanup
            }
        }
    }

    // Update map colors based on infection count
    updateColors() {
        this.g.selectAll(".country").each((d: any, i: number, nodes: any) => {
            const id = d.id;
            const data = this.simulation.countries.get(id);

            if (data) {
                if (data.infected > 0) {
                    // Calculate infection ratio: infected / population
                    const ratio = data.infected / data.population;
                    const color = this.getColorForRatio(ratio);
                    d3.select(nodes[i]).attr("fill", color);
                } else if (data.recovered > 0 || data.dead > 0) {
                    // Phase 6: Fade color if infections hit 0 but country was previously infected
                    // They either gained immunity (recovered) or died, the crisis is "over" locally.
                    // 感染者が0になった場合は「灰色」にする
                    d3.select(nodes[i]).attr("fill", "#6e7681");
                } else {
                    d3.select(nodes[i]).attr("fill", "#21262d"); // Uninfected baseline
                }
            }
        });
    }

    getColorForRatio(ratio: number): string {
        // Handle no cases
        if (ratio <= 0) return "#21262d";

        // To ensure initial tiny clusters are visible in large countries, but fade to gray as they approach 0
        if (ratio < 0.001) return d3.interpolateRgb("#6e7681", "#d29922")(ratio * 1000);

        if (ratio < 0.01) return d3.interpolateRgb("#d29922", "#f85149")(ratio * 100);
        if (ratio < 0.1) return d3.interpolateRgb("#f85149", "#8a1310")(ratio * 10);
        return d3.interpolateRgb("#8a1310", "#500605")(Math.min(1, ratio * 2));
    }
}
