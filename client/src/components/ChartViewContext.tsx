import { createContext, useContext } from 'react'

export type ChartViewState = {
  zoom: number
  offset: { x: number; y: number }
}

export const ChartViewContext = createContext<ChartViewState>({
  zoom: 1,
  offset: { x: 0, y: 0 },
})

export function useChartView() {
  return useContext(ChartViewContext)
}
