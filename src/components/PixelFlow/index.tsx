import React, { useEffect, useRef } from 'react';
import { Scene } from './scene';

const PixelFlow: React.FC = () => {
  const sceneRef = useRef<Scene>(null);
  const requestRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = 500;
      canvasRef.current.height = 350;
      sceneRef.current = new Scene(canvasRef.current);
      const animate = () => {
        requestRef.current = requestAnimationFrame(() => {
          if (sceneRef.current) {
            sceneRef.current.draw();
            animate();
          }
        });
      }
      animate();
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  return (
    <div className="flex justify-center">
      <canvas ref={canvasRef} />
    </div>
  );
};

export default PixelFlow;
