import type { ControlPosition, IControl } from 'maplibre-gl'
import { useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MapContext } from './context.ts'

interface MapControlProps {
  /** The corner of the map to float in. */
  position: ControlPosition
  className?: string
  children: ReactNode
}

/**
 * Floats its children over a corner of the map as a MapLibre control, so they
 * stack with MapLibre's own controls. Use it inside `MapView`.
 */
export function MapControl({ position, className, children }: MapControlProps) {
  const map = useContext(MapContext)
  const [container] = useState(() => {
    const element = document.createElement('div')
    element.className = 'maplibregl-ctrl'
    return element
  })

  useEffect(() => {
    if (!map) return
    const control: IControl = {
      onAdd: () => container,
      onRemove: () => container.remove(),
    }
    map.addControl(control, position)
    return () => {
      map.removeControl(control)
    }
  }, [map, container, position])

  return createPortal(<div className={className}>{children}</div>, container)
}
