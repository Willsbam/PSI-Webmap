import { useState } from 'react'
import type { LatLngBoundsExpression } from 'leaflet'
import './SearchBar.css'

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
  boundingbox: [string, string, string, string]
}

interface SearchBarProps {
  onSelectLocation: (bounds: LatLngBoundsExpression) => void
}

function SearchBar({ onSelectLocation }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<NominatimResult[]>([])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setResults([])

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&q=${encodeURIComponent(trimmed)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      const data: NominatimResult[] = await res.json()

      if (data.length === 0) {
        setError('No matching location found')
        return
      }

      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (result: NominatimResult) => {
    const [south, north, west, east] = result.boundingbox.map(Number)
    onSelectLocation([
      [south, west],
      [north, east],
    ])
    setQuery(result.display_name)
    setResults([])
  }

  return (
    <form className="search-bar" onSubmit={handleSearch}>
      <div className="search-bar-row">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setResults([])
            setError(null)
          }}
          placeholder="Search a US location…"
        />
        <button type="submit" disabled={loading}>
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {error && <div className="search-error">{error}</div>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((result, i) => (
            <li key={`${result.lat},${result.lon},${i}`}>
              <button type="button" onClick={() => handleSelect(result)}>
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

export default SearchBar
