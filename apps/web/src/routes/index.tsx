import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AppShell } from '../components/app-shell'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export const Route = createFileRoute('/')({
  component: App,
})

type SchoolSearchResult = {
  id: string
  departmentSchoolId: string
  schoolName: string
  schoolType: string | null
  region: string | null
  websiteUrl: string
  lastSuccessfulCrawlAt: string | null
  score: number
}

type SchoolSearchResponse = {
  query: string
  schools: SchoolSearchResult[]
}

function App() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SchoolSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const trimmedQuery = query.trim()

  useEffect(() => {
    const controller = new AbortController()

    if (trimmedQuery.length < 2) {
      setResults([])
      setSelectedIndex(0)
      setIsSearching(false)
      setSearchError(null)
      return () => controller.abort()
    }

    setIsSearching(true)
    setSearchError(null)

    const timeout = window.setTimeout(() => {
      fetchSchoolSearch(trimmedQuery, controller.signal)
        .then((response) => {
          setResults(response.schools)
          setSelectedIndex(0)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setResults([])
          setSearchError(error instanceof Error ? error.message : 'Unable to search schools')
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false)
        })
    }, 180)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [trimmedQuery])

  const selectedSchool = useMemo(() => results[selectedIndex] ?? results[0], [results, selectedIndex])

  const openSchoolView = (school: SchoolSearchResult) => {
    void navigate({
      to: '/schools/$schoolId',
      params: { schoolId: school.id },
    })
  }

  return (
    <AppShell>
      <main className="home-main">
        <section className="hero-section" aria-labelledby="hero-title">
          <button className="hero-label" type="button">
            Select Your School
          </button>

          <h1 id="hero-title" className="hero-title">
            Find my school
          </h1>

          <form
            className="school-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              if (selectedSchool) openSchoolView(selectedSchool)
            }}
          >
            <Search className="school-search-icon" size={22} aria-hidden="true" />
            <input
              type="text"
              aria-label="Search for a school"
              placeholder="What school are you looking for?"
              value={query}
              aria-controls="school-search-results"
              aria-expanded={results.length > 0}
              aria-autocomplete="list"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && results.length > 0) {
                  event.preventDefault()
                  setSelectedIndex((index) => Math.min(index + 1, results.length - 1))
                }
                if (event.key === 'ArrowUp' && results.length > 0) {
                  event.preventDefault()
                  setSelectedIndex((index) => Math.max(index - 1, 0))
                }
                if (event.key === 'Enter' && selectedSchool) {
                  event.preventDefault()
                  openSchoolView(selectedSchool)
                }
              }}
            />
            <button className="school-search-button" type="submit" disabled={!selectedSchool}>
              Search
            </button>
          </form>

          <div className="school-search-results" id="school-search-results" role="listbox">
            {isSearching ? <p className="school-search-state">Searching...</p> : null}
            {searchError ? <p className="school-search-state">{searchError}</p> : null}
            {!isSearching && !searchError && trimmedQuery.length >= 2 && results.length === 0 ? (
              <p className="school-search-state">No schools found</p>
            ) : null}
            {results.map((school, index) => (
              <button
                className="school-result"
                data-selected={index === selectedIndex}
                type="button"
                key={school.id}
                role="option"
                aria-selected={index === selectedIndex}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => openSchoolView(school)}
              >
                <span>{school.schoolName}</span>
                <small>{[school.region, school.schoolType].filter(Boolean).join(' / ') || school.websiteUrl}</small>
              </button>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  )
}

async function fetchSchoolSearch(query: string, signal: AbortSignal): Promise<SchoolSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: '8' })
  const response = await fetch(`${apiBaseUrl}/schools/search?${params}`, { signal })

  if (!response.ok) {
    throw new Error(`School search failed (${response.status})`)
  }

  return response.json() as Promise<SchoolSearchResponse>
}
