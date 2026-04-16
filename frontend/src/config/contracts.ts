import contactRegistryAbi from '../abi/ContactRegistry.json'

export const CONTACT_REGISTRY_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`) || '0x0000000000000000000000000000000000000000'

export const CONTACT_REGISTRY_ABI = contactRegistryAbi as readonly any[]

export const BEE_GATEWAY_URL = import.meta.env.VITE_BEE_GATEWAY_URL || 'https://api.gateway.ethswarm.org'
export const BEE_API_URL = import.meta.env.VITE_BEE_API_URL || 'http://localhost:1633'
