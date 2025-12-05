'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

interface WaterWaveCursorProps {
  colors?: string[]
}

export default function WaterWaveCursor({ colors = ['#60a5fa', '#3b82f6', '#2563eb'] }: WaterWaveCursorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 })
  const [waves, setWaves] = useState<{ id: number; x: number; y: number; color: string }[]>([])
  const waveIdRef = useRef(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX
      const y = e.clientY

      setCursorPosition({ x, y })

      // Create a new wave
      const newWave = {
        id: waveIdRef.current++,
        x,
        y,
        color: colors[Math.floor(Math.random() * colors.length)]
      }

      setWaves(prev => [...prev, newWave])

      // Remove wave after animation completes
      setTimeout(() => {
        setWaves(prev => prev.filter(wave => wave.id !== newWave.id))
      }, 1200)
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [colors])

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {waves.map(wave => (
        <motion.div
          key={wave.id}
          className="absolute rounded-full pointer-events-none"
          initial={{
            left: wave.x - 20,
            top: wave.y - 20,
            width: 40,
            height: 40,
            opacity: 0.6,
            backgroundColor: wave.color,
            filter: 'blur(8px)'
          }}
          animate={{
            left: wave.x - 60,
            top: wave.y - 60,
            width: 120,
            height: 120,
            opacity: 0,
            filter: 'blur(20px)'
          }}
          transition={{
            duration: 1.2,
            ease: 'easeOut'
          }}
        />
      ))}
    </div>
  )
}
