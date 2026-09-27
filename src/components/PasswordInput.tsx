import { useState, type InputHTMLAttributes } from 'react'
import { EyeIcon, EyeOffIcon } from './Icons'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** Password input with a show/hide toggle. Accepts the same props as a normal <input>. */
export default function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="password-field">
      <input {...props} type={visible ? 'text' : 'password'} autoCapitalize="off" spellCheck={false} />
      <button
        type="button"
        className="password-toggle"
        onClick={(e) => {
          e.preventDefault() // don't trigger a surrounding <label>'s click behaviour
          setVisible((v) => !v)
        }}
        // keep focus (and the mobile keyboard) in the field when tapping the eye
        onMouseDown={(e) => e.preventDefault()}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </span>
  )
}
