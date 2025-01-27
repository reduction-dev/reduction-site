import React, { useEffect, useRef } from 'react';
import styles from './styles.module.css';

interface Pixel {
  x: number;
  y: number;
  color: string;
  id: number;
  speed: number;
  stage: number;
  target?: Position;
}

interface Position {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
}

const COLORS = {
  GREEN: '#4ade80',
  YELLOW: '#facc15',
  RED: '#f87171',
  BLUE: '#60a5fa'
};

const PIXEL_SPEED = 2;
const PIXEL_SPACING = 20;
const PIXEL_SPAWN_INTERVAL = PIXEL_SPACING / PIXEL_SPEED;

const PixelFlow: React.FC = () => {
  const requestRef = useRef<number>();
  const pixelsRef = useRef<Pixel[]>([]);
  const lastTimeRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCountRef = useRef<number>(0);

  // First row of boxes positions
  const topBoxes: Box[] = [
    { x: 160, y: 240 },
    { x: 280, y: 240 },
    { x: 400, y: 240 },
    { x: 520, y: 240 }
  ];

  // Second row of boxes positions
  const bottomBoxes: Box[] = [
    { x: 160, y: 360 },
    { x: 280, y: 360 },
    { x: 400, y: 360 },
    { x: 520, y: 360 }
  ];

  const createPixel = (streamIndex: number): Pixel => {
    const colors = [COLORS.GREEN, COLORS.YELLOW, COLORS.RED, COLORS.BLUE];
    return {
      x: 160 + streamIndex * 120,
      y: -10,
      color: colors[Math.floor(Math.random() * colors.length)],
      id: Math.random(),
      speed: PIXEL_SPEED,
      stage: 0
    };
  };

  const animate = (timestamp: number) => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;
    frameCountRef.current += 1;

    // Clear canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Draw boxes
    ctx.fillStyle = '#444';
    [...topBoxes, ...bottomBoxes].forEach(box => {
      ctx.fillRect(box.x, box.y, 40, 40);
    });
    ctx.fillRect(340, 480, 60, 60); // Final box

    // Update and draw pixels
    pixelsRef.current = pixelsRef.current.filter(pixel => {
      // Move pixel
      if (pixel.target !== undefined) {
        const dx = pixel.target.x - pixel.x;
        const dy = pixel.target.y - pixel.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 2) {
          if (pixel.stage === 2) {
            return false; // Remove pixel
          }
          // Set new targets based on color and stage
          if (pixel.stage === 0) {
            const bottomBoxIndex = {
              [COLORS.GREEN]: 0,
              [COLORS.YELLOW]: 1,
              [COLORS.RED]: 2,
              [COLORS.BLUE]: 3
            }[pixel.color] || 0;
            
            pixel.target.x = bottomBoxes[bottomBoxIndex].x + 20;
            pixel.target.y = bottomBoxes[bottomBoxIndex].y;
            pixel.stage = 1;
          } else if (pixel.stage === 1) {
            pixel.target.x = 370;
            pixel.target.y = 510;
            pixel.stage = 2;
          }
        } else {
          pixel.x += (dx / distance) * pixel.speed;
          pixel.y += (dy / distance) * pixel.speed;
        }
      } else if (pixel.y < topBoxes[0].y) {
        pixel.y += pixel.speed;
      } else {
        // Reached first box, set target
        const boxIndex = Math.floor((pixel.x - 140) / 120);
        pixel.target = { x: topBoxes[boxIndex].x + 20, y: topBoxes[boxIndex].y };
      }

      // Draw pixel
      ctx.fillStyle = pixel.color;
      if (pixel.stage < 2) {
        ctx.fillRect(pixel.x - 2, pixel.y - 2, 4, 4);
      } else {
        ctx.fillRect(pixel.x - 8, pixel.y - 8, 16, 16);
      }

      return true;
    });

    // Add new pixels
    if (frameCountRef.current % PIXEL_SPAWN_INTERVAL === 0) {
      for (let i = 0; i < 4; i++) {
        pixelsRef.current.push(createPixel(i));
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = 720;
      canvasRef.current.height = 600;
    }
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default PixelFlow;
