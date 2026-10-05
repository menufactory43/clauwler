import type { ClientModule } from 'claude-code'

import type { InputProps } from '../types'

type Key = { id: number; key: string }
type S = { inst: number; next: number; keys: Key[]; hasKeys: boolean }

/** The strip that holds the keyboard once clicked: every key goes to the hooks, numbered. */
const Input: ClientModule<InputProps, S> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    const own: S = { inst: Math.floor(Math.random() * 1e9), next: 1, keys: [], hasKeys: false }
    surface.onKey(event => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      own.keys = [...own.keys, { id: own.next++, key }].slice(-24)
      own.hasKeys = true
      surface.post({ inst: own.inst, keys: own.keys })
      surface.setState({ ...own })
    })
    surface.setState({ ...own })
  }
  const isArmed = surface.state?.hasKeys === true
  return (
    <Box flexDirection="row">
      {isArmed
        ? <Text color="#6dc2ca">⌨ {props.hint}</Text>
        : <Text color="#dad45e" bold>▶ Clique ici pour prendre le clavier · {props.hint}</Text>}
    </Box>
  )
}

export default Input
