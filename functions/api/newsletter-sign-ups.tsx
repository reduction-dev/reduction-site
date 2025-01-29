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
  if (typeof rawEmail !== 'string' || rawEmail.trim().length === 0) {
    return Response.json(
      { success: false, error: "email required" },
      { status: 422 }
    );
  }

  // Normalize email for db query
  const email = rawEmail.trim().toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255) {
    return Response.json(
      { success: false, error: "invalid email" },
      { status: 422 }
    );
  }

  try {
    const existing = await context.env.DB
      .prepare('SELECT email FROM newsletter_sign_ups WHERE email = ?')
      .bind(email)
      .first();

    if (existing) {
      return Response.json(
        { success: false, error: "email already signed up" },
        { status: 409 }
      );
    }

    await context.env.DB
      .prepare('INSERT INTO newsletter_sign_ups (email) VALUES (?)')
      .bind(email)
      .run();
  } catch (error) {
    console.error('database failed', error);
    return Response.json(
      { success: false, error: "database error" },
      { status: 500 }
    );
  }

  // Notification request
  try {
    await fetch(context.env.NOTIFY_URL, { 
      method: 'POST', 
      body: `${email} newsletter sign up` 
    });
  } catch (error) {
    console.error('failed to notify', error);
  }

  return Response.json(
    { success: true, message: 'Subscribed' },
    { status: 201 }
  );
}
