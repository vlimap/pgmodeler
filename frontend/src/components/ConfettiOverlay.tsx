import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';

type ConfettiOverlayProps = {
  onDone: () => void;
  duration?: number;
};

const confettiStyles = `
@keyframes confetti-fall {
  0% {
    transform:
      translate3d(50vw, 50vh, 0)
      translate3d(var(--confetti-start-x), var(--confetti-start-y), 0)
      rotate(var(--confetti-rotation-start))
      scale(0.4);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  100% {
    transform:
      translate3d(50vw, 50vh, 0)
      translate3d(var(--confetti-end-x), var(--confetti-end-y), 0)
      rotate(var(--confetti-rotation-end))
      scale(1);
    opacity: 0;
  }
}

@keyframes confetti-burst {
  0% {
    transform: translate(-50%, -50%) scale(0.4);
    opacity: 0.85;
  }
  40% {
    opacity: 0.6;
  }
  85% {
    opacity: 0.15;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.35);
    opacity: 0;
  }
}

@keyframes message-pop {
  0% {
    transform: translate(-50%, -50%) scale(0.6);
    opacity: 0;
  }
  25% {
    transform: translate(-50%, -50%) scale(1.05);
    opacity: 1;
  }
  75% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(0.92);
    opacity: 0;
  }
}

.pg-confetti-item {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--confetti-size);
  height: var(--confetti-size);
  background: var(--confetti-color);
  opacity: 0;
  will-change: transform, opacity;
  animation: confetti-fall linear forwards;
}

.pg-confetti-burst {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18rem;
  height: 18rem;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(250,204,21,0.55) 0%, rgba(37,99,235,0.3) 55%, rgba(15,23,42,0) 75%);
  pointer-events: none;
  transform-origin: center;
  animation: confetti-burst 1.8s ease-out forwards;
  filter: blur(1px);
}

.pg-confetti-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center;
  animation: message-pop 2.4s ease-out forwards;
  font-size: clamp(1.75rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 0.75rem 1.25rem;
  border-radius: 9999px;
  background: linear-gradient(135deg, #facc15, #f97316, #a855f7);
  color: #0f172a;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.35);
}
`;

const COLORS = ['#facc15', '#fb923c', '#38bdf8', '#a855f7', '#22c55e', '#f472b6'];
const COUNT = 160;

export const ConfettiOverlay = ({ onDone, duration = 3000 }: ConfettiOverlayProps) => {
  const confetti = useMemo(() => {
    return Array.from({ length: COUNT }).map((_, index) => {
      const size = `${Math.random() * 0.7 + 0.35}rem`;
      const color = COLORS[index % COLORS.length];
      const delay = `${Math.random() * 0.35}s`;
        const startRadius = Math.random() * 40;
        const startAngle = Math.random() * Math.PI * 2;
        const endRadius = 80 + Math.random() * 120;
        const endAngle = startAngle + (Math.random() * Math.PI - Math.PI / 2);
        const startX = `${(Math.cos(startAngle) * startRadius).toFixed(2)}vw`;
        const startY = `${(Math.sin(startAngle) * startRadius).toFixed(2)}vh`;
        const endX = `${(Math.cos(endAngle) * endRadius).toFixed(2)}vw`;
        const endY = `${(Math.sin(endAngle) * endRadius).toFixed(2)}vh`;
      const rotationStart = `${Math.random() * 160 - 80}deg`;
      const rotationEnd = `${Math.random() * 520 - 260}deg`;
      const durationValue = `${2.6 + Math.random() * 1.4}s`;

      return {
        id: index,
        size,
        color,
        delay,
        startX,
        startY,
        endX,
          endY,
        rotationStart,
        rotationEnd,
        durationValue,
      };
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDone();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      <style>{confettiStyles}</style>
      <div className="pg-confetti-burst" />
      <div className="pg-confetti-message">Obrigado!</div>
      {confetti.map((item) => (
        <span
          key={item.id}
          className="pg-confetti-item"
          style={{
            '--confetti-size': item.size,
            '--confetti-color': item.color,
            '--confetti-start-x': item.startX,
            '--confetti-start-y': item.startY,
            '--confetti-end-x': item.endX,
            '--confetti-end-y': item.endY,
            '--confetti-rotation-start': item.rotationStart,
            '--confetti-rotation-end': item.rotationEnd,
            animationDelay: item.delay,
            animationDuration: item.durationValue,
          } as CSSProperties}
        />
      ))}
    </div>
  );
};
