export type StructuredResume = {
  basics: {
    name: string
    email: string
    phone: string
    location: string
    website: string
    linkedin: string
    github: string
    summary: string
  }
  work: Array<{ name: string; position: string; startDate: string; endDate: string; summary: string }>
  education: Array<{ institution: string; area: string; studyType: string; startDate: string; endDate: string }>
  skills: Array<{ name: string; keywords: string }>
  projects: Array<{ name: string; description: string; url: string; highlights: string }>
  publications: Array<{ name: string; summary: string; date: string }>
  awards: Array<{ name: string; summary: string; date: string }>
  certifications: Array<{ name: string; summary: string; date: string }>
}

export function emptyStructured(): StructuredResume {
  return {
    basics: {
      name: '',
      email: '',
      phone: '',
      location: '',
      website: '',
      linkedin: '',
      github: '',
      summary: '',
    },
    work: [],
    education: [],
    skills: [],
    projects: [],
    publications: [],
    awards: [],
    certifications: [],
  }
}

export function fromApi(raw: Record<string, unknown> | null | undefined): StructuredResume {
  const base = emptyStructured()
  if (!raw) return base
  const basics = (raw.basics || {}) as Record<string, string>
  base.basics = {
    name: basics.name || '',
    email: basics.email || '',
    phone: basics.phone || '',
    location: basics.location || '',
    website: basics.website || basics.portfolio || '',
    linkedin: basics.linkedin || '',
    github: basics.github || '',
    summary: basics.summary || '',
  }
  base.work = ((raw.work as Array<Record<string, string>>) || []).map((w) => ({
    name: w.name || '',
    position: w.position || '',
    startDate: w.startDate || '',
    endDate: w.endDate || '',
    summary: w.summary || '',
  }))
  base.education = ((raw.education as Array<Record<string, string>>) || []).map((e) => ({
    institution: e.institution || '',
    area: e.area || '',
    studyType: e.studyType || '',
    startDate: e.startDate || '',
    endDate: e.endDate || '',
  }))
  base.skills = ((raw.skills as Array<Record<string, unknown>>) || []).map((s) => ({
    name: String(s.name || ''),
    keywords: Array.isArray(s.keywords) ? (s.keywords as string[]).join(', ') : String(s.keywords || ''),
  }))
  base.projects = ((raw.projects as Array<Record<string, unknown>>) || []).map((p) => ({
    name: String(p.name || ''),
    description: String(p.description || p.summary || ''),
    url: String(p.url || ''),
    highlights: Array.isArray(p.highlights)
      ? (p.highlights as string[]).join('\n')
      : String(p.highlights || ''),
  }))
  for (const key of ['publications', 'awards', 'certifications'] as const) {
    base[key] = ((raw[key] as Array<Record<string, string>>) || []).map((r) => ({
      name: r.name || r.title || '',
      summary: r.summary || r.description || r.issuer || '',
      date: r.date || r.releaseDate || '',
    }))
  }
  return base
}

export function toApi(data: StructuredResume): Record<string, unknown> {
  return {
    basics: { ...data.basics },
    work: data.work,
    education: data.education,
    skills: data.skills.map((s) => ({
      name: s.name,
      keywords: s.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    })),
    projects: data.projects.map((p) => ({
      name: p.name,
      description: p.description,
      url: p.url || undefined,
      highlights: p.highlights
        .split('\n')
        .map((h) => h.trim())
        .filter(Boolean),
    })),
    publications: data.publications,
    awards: data.awards,
    certifications: data.certifications,
  }
}

type Props = {
  value: StructuredResume
  onChange: (v: StructuredResume) => void
  /** Field keys like basics.email — empty/undefined = show all */
  visibleFields?: string[]
  /** Section keys like work, education — empty/undefined = show all */
  visibleSections?: string[]
}

function showField(visible: string[] | undefined, key: string): boolean {
  if (!visible || visible.length === 0) return true
  return visible.includes(key)
}

function showSection(visible: string[] | undefined, key: string): boolean {
  if (!visible || visible.length === 0) return true
  return visible.includes(key)
}

export function StructuredForm({ value, onChange, visibleFields, visibleSections }: Props) {
  function setBasics(k: keyof StructuredResume['basics'], v: string) {
    onChange({ ...value, basics: { ...value.basics, [k]: v } })
  }

  function updateList<K extends 'work' | 'education' | 'skills' | 'projects' | 'publications' | 'awards' | 'certifications'>(
    key: K,
    index: number,
    field: string,
    v: string,
  ) {
    const list = [...value[key]] as Array<Record<string, string>>
    list[index] = { ...list[index], [field]: v }
    onChange({ ...value, [key]: list })
  }

  function add<K extends 'work' | 'education' | 'skills' | 'projects' | 'publications' | 'awards' | 'certifications'>(
    key: K,
    blank: Record<string, string>,
  ) {
    onChange({ ...value, [key]: [...value[key], blank] })
  }

  function remove<K extends 'work' | 'education' | 'skills' | 'projects' | 'publications' | 'awards' | 'certifications'>(
    key: K,
    index: number,
  ) {
    onChange({ ...value, [key]: value[key].filter((_, i) => i !== index) })
  }

  const f = (key: string) => showField(visibleFields, key)
  const sec = (key: string) => showSection(visibleSections, key)

  function simpleList(
    key: 'publications' | 'awards' | 'certifications',
    title: string,
    namePh: string,
  ) {
    if (!sec(key)) return null
    return (
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="section-title mb-0">{title}</h3>
          <button
            type="button"
            className="btn btn-secondary text-xs"
            onClick={() => add(key, { name: '', summary: '', date: '' })}
          >
            + Add
          </button>
        </div>
        <div className="space-y-3">
          {value[key].map((row, i) => (
            <div key={i} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 space-y-2">
              <div className="flex justify-end">
                <button type="button" className="btn btn-danger text-xs py-1" onClick={() => remove(key, i)}>
                  Remove
                </button>
              </div>
              <input
                className="input"
                placeholder={namePh}
                value={row.name}
                onChange={(e) => updateList(key, i, 'name', e.target.value)}
              />
              <input
                className="input"
                placeholder="Date"
                value={row.date}
                onChange={(e) => updateList(key, i, 'date', e.target.value)}
              />
              <textarea
                className="input min-h-12"
                placeholder="Details"
                value={row.summary}
                onChange={(e) => updateList(key, i, 'summary', e.target.value)}
              />
            </div>
          ))}
          {value[key].length === 0 && (
            <p className="text-xs text-[var(--color-muted)]">None yet.</p>
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-6 max-h-full overflow-y-auto pr-1">
      <section>
        <h3 className="section-title">Basics</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {f('basics.name') && (
            <div>
              <label className="label" htmlFor="basics-name">
                Full name
              </label>
              <input
                id="basics-name"
                className="input"
                value={value.basics.name}
                onChange={(e) => setBasics('name', e.target.value)}
              />
            </div>
          )}
          {f('basics.email') && (
            <div>
              <label className="label" htmlFor="basics-email">
                Email
              </label>
              <input
                id="basics-email"
                className="input"
                type="email"
                value={value.basics.email}
                onChange={(e) => setBasics('email', e.target.value)}
              />
            </div>
          )}
          {f('basics.phone') && (
            <div>
              <label className="label" htmlFor="basics-phone">
                Phone
              </label>
              <input
                id="basics-phone"
                className="input"
                value={value.basics.phone}
                onChange={(e) => setBasics('phone', e.target.value)}
              />
            </div>
          )}
          {f('basics.location') && (
            <div>
              <label className="label" htmlFor="basics-location">
                Location
              </label>
              <input
                id="basics-location"
                className="input"
                value={value.basics.location}
                onChange={(e) => setBasics('location', e.target.value)}
              />
            </div>
          )}
          {f('basics.website') && (
            <div>
              <label className="label" htmlFor="basics-website">
                Portfolio / website
              </label>
              <input
                id="basics-website"
                className="input"
                value={value.basics.website}
                onChange={(e) => setBasics('website', e.target.value)}
              />
            </div>
          )}
          {f('basics.linkedin') && (
            <div>
              <label className="label" htmlFor="basics-linkedin">
                LinkedIn
              </label>
              <input
                id="basics-linkedin"
                className="input"
                placeholder="https://linkedin.com/in/…"
                value={value.basics.linkedin}
                onChange={(e) => setBasics('linkedin', e.target.value)}
              />
            </div>
          )}
          {f('basics.github') && (
            <div>
              <label className="label" htmlFor="basics-github">
                GitHub
              </label>
              <input
                id="basics-github"
                className="input"
                placeholder="username or URL"
                value={value.basics.github}
                onChange={(e) => setBasics('github', e.target.value)}
              />
            </div>
          )}
          {f('basics.summary') && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="basics-summary">
                Summary
              </label>
              <textarea
                id="basics-summary"
                className="input min-h-20 resize-y"
                value={value.basics.summary}
                onChange={(e) => setBasics('summary', e.target.value)}
              />
            </div>
          )}
        </div>
      </section>

      {sec('work') && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title mb-0">Work</h3>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={() =>
                add('work', { name: '', position: '', startDate: '', endDate: '', summary: '' })
              }
            >
              + Add
            </button>
          </div>
          <div className="space-y-3">
            {value.work.map((w, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3">
                <div className="mb-2 flex justify-end">
                  <button type="button" className="btn btn-danger text-xs py-1" onClick={() => remove('work', i)}>
                    Remove
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="input" placeholder="Company" value={w.name} onChange={(e) => updateList('work', i, 'name', e.target.value)} />
                  <input className="input" placeholder="Title" value={w.position} onChange={(e) => updateList('work', i, 'position', e.target.value)} />
                  <input className="input" placeholder="Start (YYYY-MM)" value={w.startDate} onChange={(e) => updateList('work', i, 'startDate', e.target.value)} />
                  <input className="input" placeholder="End" value={w.endDate} onChange={(e) => updateList('work', i, 'endDate', e.target.value)} />
                  <textarea className="input sm:col-span-2 min-h-16" placeholder="Highlights" value={w.summary} onChange={(e) => updateList('work', i, 'summary', e.target.value)} />
                </div>
              </div>
            ))}
            {value.work.length === 0 && <p className="text-xs text-[var(--color-muted)]">No work entries yet.</p>}
          </div>
        </section>
      )}

      {sec('education') && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title mb-0">Education</h3>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={() =>
                add('education', { institution: '', area: '', studyType: '', startDate: '', endDate: '' })
              }
            >
              + Add
            </button>
          </div>
          <div className="space-y-3">
            {value.education.map((ed, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2 flex justify-end">
                  <button type="button" className="btn btn-danger text-xs py-1" onClick={() => remove('education', i)}>
                    Remove
                  </button>
                </div>
                <input className="input" placeholder="School" value={ed.institution} onChange={(e) => updateList('education', i, 'institution', e.target.value)} />
                <input className="input" placeholder="Field" value={ed.area} onChange={(e) => updateList('education', i, 'area', e.target.value)} />
                <input className="input" placeholder="Degree" value={ed.studyType} onChange={(e) => updateList('education', i, 'studyType', e.target.value)} />
                <input className="input" placeholder="Years" value={ed.startDate} onChange={(e) => updateList('education', i, 'startDate', e.target.value)} />
              </div>
            ))}
            {value.education.length === 0 && (
              <p className="text-xs text-[var(--color-muted)]">No education entries yet.</p>
            )}
          </div>
        </section>
      )}

      {sec('skills') && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title mb-0">Skills</h3>
            <button type="button" className="btn btn-secondary text-xs" onClick={() => add('skills', { name: '', keywords: '' })}>
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {value.skills.map((s, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input className="input flex-1 min-w-[8rem]" placeholder="Category" value={s.name} onChange={(e) => updateList('skills', i, 'name', e.target.value)} />
                <input className="input flex-[2] min-w-[10rem]" placeholder="Keywords (comma-separated)" value={s.keywords} onChange={(e) => updateList('skills', i, 'keywords', e.target.value)} />
                <button type="button" className="btn btn-danger text-xs" onClick={() => remove('skills', i)}>
                  ×
                </button>
              </div>
            ))}
            {value.skills.length === 0 && (
              <p className="text-xs text-[var(--color-muted)]">No skills yet — add a category.</p>
            )}
          </div>
        </section>
      )}

      {sec('projects') && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title mb-0">Projects</h3>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={() => add('projects', { name: '', description: '', url: '', highlights: '' })}
            >
              + Add
            </button>
          </div>
          <div className="space-y-3">
            {value.projects.map((p, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 space-y-2">
                <div className="flex justify-end">
                  <button type="button" className="btn btn-danger text-xs py-1" onClick={() => remove('projects', i)}>
                    Remove
                  </button>
                </div>
                <input className="input" placeholder="Project name" value={p.name} onChange={(e) => updateList('projects', i, 'name', e.target.value)} />
                <input className="input" placeholder="URL" value={p.url} onChange={(e) => updateList('projects', i, 'url', e.target.value)} />
                <textarea className="input min-h-14" placeholder="Description" value={p.description} onChange={(e) => updateList('projects', i, 'description', e.target.value)} />
                <textarea className="input min-h-16" placeholder="Highlights (one per line)" value={p.highlights} onChange={(e) => updateList('projects', i, 'highlights', e.target.value)} />
              </div>
            ))}
            {value.projects.length === 0 && (
              <p className="text-xs text-[var(--color-muted)]">No projects yet.</p>
            )}
          </div>
        </section>
      )}

      {simpleList('publications', 'Publications', 'Title')}
      {simpleList('awards', 'Awards', 'Award name')}
      {simpleList('certifications', 'Certifications', 'Certification name')}
    </div>
  )
}
