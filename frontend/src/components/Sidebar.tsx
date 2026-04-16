import { NavLink } from 'react-router'

export default function Sidebar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex-1 text-center text-sm py-2 border-b-2 ${isActive ? 'border-[#25d366] text-[#e8eef2]' : 'border-transparent text-[#8a97a3] hover:text-[#e8eef2]'}`

  return (
    <aside className="w-72 bg-[#161c22] border-r border-[#252d34] flex flex-col">
      <div className="flex">
        <NavLink to="/" end className={linkClass}>Chats</NavLink>
        <NavLink to="/directory" className={linkClass}>Directory</NavLink>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-sm text-[#8a97a3]">
        {/* Chat list populated from IndexedDB + PSS inbox */}
      </div>
    </aside>
  )
}
