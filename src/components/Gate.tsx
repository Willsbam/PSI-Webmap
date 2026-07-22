import { useState, type FormEvent, type ReactNode } from 'react'
import PSIlogo from '../assets/PSILogo.png'
import './Gate.css'

//This is meant to keep out non technical people from accesing the site
//Not a real blocker
const REQUIRED_PASSWORD = 'psi-maps'

// Remembers the unlock / mobile acknowledgement for the browser tab/session, so
// a reload doesn't re-prompt but a fresh session does.
const UNLOCK_KEY = 'psi-webmap-unlocked'
const MOBILE_ACK_KEY = 'psi-webmap-mobile-ack'

// Phones and tablets: a narrow viewport or a touch-primary pointer. Checked once
// on mount — this only decides whether to show the warning, not layout.
function isMobileDevice(): boolean {
  return window.matchMedia('(max-width: 820px)').matches
}

interface GateProps {
  children: ReactNode
}

function Gate({ children }: GateProps) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(UNLOCK_KEY) === 'true')
  // Non-mobile visitors start "accepted" so the warning never shows for them.
  const [mobileAccepted, setMobileAccepted] = useState(
    () => sessionStorage.getItem(MOBILE_ACK_KEY) === 'true' || !isMobileDevice(),
  )
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (value === REQUIRED_PASSWORD) {
      sessionStorage.setItem(UNLOCK_KEY, 'true')
      setUnlocked(true)
    } else {
      setError(true)
    }
  }

  const handleAcceptMobile = () => {
    sessionStorage.setItem(MOBILE_ACK_KEY, 'true')
    setMobileAccepted(true)
  }

  if (!unlocked) {
    return (
      <div className="gate">
        <form className="gate-card" onSubmit={handleSubmit}>
          <img className="gate-logo" src={PSIlogo} alt="PSI logo" />
          <h1>PSI Lidar and Shapefile Explorer</h1>
          <p>Enter the access password to continue.</p>
          <input
            type="password"
            className="gate-input"
            value={value}
            autoFocus
            placeholder="Password"
            onChange={(e) => {
              setValue(e.target.value)
              setError(false)
            }}
          />
          {error && <p className="gate-error">Incorrect password — try again.</p>}
          <button type="submit" className="gate-button">
            Enter
          </button>
        </form>
      </div>
    )
  }

  if (!mobileAccepted) {
    return (
      <div className="gate">
        <div className="gate-card">
          <img className="gate-logo" src={PSIlogo} alt="PSI logo" />
          <h1>Desktop experience</h1>
          <p className="gate-warning">
            This site was intentionally designed for desktop use only. On a phone or tablet the map,
            drawing tools, and data panel may be difficult to use or may not work as expected.
          </p>
          <p>Continue anyway?</p>
          <button type="button" className="gate-button" onClick={handleAcceptMobile}>
            Accept and continue
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default Gate
