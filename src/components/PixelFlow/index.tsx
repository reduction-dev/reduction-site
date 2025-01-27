import React, { useEffect, useRef } from 'react';
import styles from './styles.module.css';
import { Scene } from './scene';

const PixelFlow: React.FC = () => {
  const sceneRef = useRef<Scene>(null);
  const requestRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = 720;
      canvasRef.current.height = 600;
      sceneRef.current = new Scene(canvasRef.current);
      const animate = () => {
        requestRef.current = requestAnimationFrame(() => {
          sceneRef.current.draw();
          animate();
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
    <div className={styles.container}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default PixelFlow;
