export default function Avatar({ user, size = 'md' }) {
  const sizes = { xs: 'size-5 text-[8px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-16 text-xl' };
  const ring = size === 'xs' ? 'ring-1' : 'ring-2';
  const initials = user?.displayName
    ?.split(' ')
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

  return user?.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.displayName} className={`${sizes[size]} ${ring} shrink-0 rounded-full object-cover ring-white`} />
  ) : (
    <span className={`${sizes[size]} ${ring} grid shrink-0 place-items-center rounded-full bg-mint font-extrabold text-forest ring-white`}>
      {initials}
    </span>
  );
}
