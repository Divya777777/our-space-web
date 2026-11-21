/** Never confirm delivery until the local transaction/file write has completed. */
export async function confirmLocalDelivery(save: () => Promise<unknown>, acknowledge: () => Promise<unknown>, active: () => boolean): Promise<boolean> {
  await save();
  if (!active()) return false;
  await acknowledge();
  return active();
}
