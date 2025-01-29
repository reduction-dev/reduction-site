export const onRequestPost: PagesFunction<Env> = async (context) => {
  let formData: FormData;
  try {
    formData = await context.request.formData();
  } catch (error) {
    console.error('invalid form data', error);
    return Response.json(
      { success: false, error: "invalid form data" },
      { status: 400 }
    );
  }

  const rawEmail = formData.get('email');
  const rawName = formData.get('name');

  // Validate required fields

  if (typeof rawEmail !== 'string' || rawEmail.trim().length === 0) {
    return Response.json(
      { success: false, error: "email required" },
      { status: 422 }
    );
  }

  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return Response.json(
      { success: false, error: "name required" },
      { status: 422 }
    );
  }

  // Normalize and validate email
  const email = rawEmail.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255) {
    return Response.json(
      { success: false, error: "invalid email" },
      { status: 422 }
    );
  }

  // Get optional fields and truncate them to reasonable lengths
  const name = rawName.trim().slice(0, 255);
  const company = formData.get('company')?.toString()?.trim()?.slice(0, 255);
  const phone = formData.get('phone')?.toString()?.trim()?.slice(0, 50);
  const useCase = formData.get('useCase')?.toString()?.trim()?.slice(0, 5_000);

  try {
    await context.env.DB
      .prepare('INSERT INTO contact_requests (name, email, company, phone, use_case) VALUES (?, ?, ?, ?, ?)')
      .bind(name, email, company, phone, useCase)
      .run();
  } catch (error) {
    console.error('database failed', error);
    return Response.json(
      { success: false, error: "database error" },
      { status: 500 }
    );
  }

  // Notification request with more details
  try {
    const details = `
      New contact request:
      Name: ${name}
      Email: ${email}
      Company: ${company || "<Empty>"}
      Phone: ${phone || "Empty"}
      Use Case: ${useCase || "Empty"}
    `.trim();

    await fetch(context.env.NOTIFY_URL, { 
      method: 'POST', 
      body: details
    });
  } catch (error) {
    console.error('failed to notify', error);
  }

  return Response.json(
    { success: true, message: 'Contact request received' },
    { status: 201 }
  );
}
