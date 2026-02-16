import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const CONNECTION_DISTANCE = 160;
const PARTICLE_COUNT_PER_10K_PX = 3;
const PARTICLE_SPEED = 0.2;

export default function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      initParticles();
    }

    function initParticles() {
      const area = canvas!.width * canvas!.height;
      const count = Math.floor((area / 10000) * PARTICLE_COUNT_PER_10K_PX);
      particles = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.5);
        particles.push({
          x: Math.random() * canvas!.width,
          y: Math.random() * canvas!.height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1 + Math.random() * 0.8,
        });
      }
    }

    function draw() {
      const w = canvas!.width;
      const h = canvas!.height;
      ctx!.clearRect(0, 0, w, h);

      // Update positions
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i]!.x - particles[j]!.x;
          const dy = particles[i]!.y - particles[j]!.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DISTANCE) {
            const opacity = (1 - dist / CONNECTION_DISTANCE) * 0.08;
            ctx!.beginPath();
            ctx!.moveTo(particles[i]!.x, particles[i]!.y);
            ctx!.lineTo(particles[j]!.x, particles[j]!.y);
            ctx!.strokeStyle = `rgba(59, 130, 246, ${opacity})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(59, 130, 246, 0.15)";
        ctx!.fill();
      }

      animationId = requestAnimationFrame(draw);
    }

    resize();
    draw();

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
    />
  );
}
