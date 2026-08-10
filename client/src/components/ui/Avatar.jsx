export default function Avatar({ user, size = 'md' }) {
  const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-16 text-xl' };
  const initials = user?.displayName
    ?.split(' ')
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

  return user?.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.displayName} className={`${sizes[size]} rounded-full object-cover ring-2 ring-white`} />
  ) : (
    <span className={`${sizes[size]} grid shrink-0 place-items-center rounded-full bg-mint font-extrabold text-forest ring-2 ring-white`}>
      {initials}
    </span>
  );
}

