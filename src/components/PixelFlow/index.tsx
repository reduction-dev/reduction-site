import React, { useEffect, useRef } from 'react';
import { Scene } from './scene';

const ASPECT_RATIO = 300 / 400; // height/width

const PixelFlow: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene>(null);
  const requestRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const animate = () => {
    if (sceneRef.current) {
      sceneRef.current.draw();
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  const sizeCanvas = () => {
    if (containerRef.current && canvasRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      canvasRef.current.width = containerWidth;
      canvasRef.current.height = containerWidth * ASPECT_RATIO;
    }
  };

  useEffect(() => {
    sizeCanvas();
    if (canvasRef.current) {
      sceneRef.current = new Scene(canvasRef.current);
      animate();
    }
    
    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="overflow-hidden w-full max-w-[400px] aspect[4/3]">
      <canvas ref={canvasRef} />
    </div>
  );
};

export default PixelFlow;
