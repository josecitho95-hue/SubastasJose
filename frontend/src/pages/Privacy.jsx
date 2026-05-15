export default function Privacy() {
  return (
    <div className="section py-12 fade-up">
      <div className="max-w-2xl mx-auto card p-8 space-y-6">
        <h1 className="text-2xl font-bold text-stone-900">Aviso de Privacidad</h1>
        <p className="text-sm text-stone-400">Última actualización: 15 de abril de 2026</p>

        <div className="space-y-4 text-sm text-stone-600 leading-relaxed">

          <h2 className="font-semibold text-stone-800 text-base mt-4">I. Identidad y Domicilio del Responsable</h2>
          <p>
            <strong>SubastasGeek</strong> (en adelante, "El Responsable"), con domicilio en la Ciudad de México, es responsable del tratamiento y protección de sus datos personales.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">II. Datos Personales Recabados</h2>
          <p>Para brindarle nuestros servicios, recabaremos los siguientes datos:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Datos de identificación y contacto:</strong> Nombre completo, correo electrónico, teléfono, domicilio de envío.</li>
            <li><strong>Datos patrimoniales y financieros:</strong> Datos de tarjeta de crédito/débito (procesados de forma segura a través de Stripe Payments México), historial de pujas, saldos en garantía y transacciones.</li>
            <li><strong>Datos de verificación (KYC):</strong> Identificación oficial (INE/Pasaporte) y comprobante de domicilio.</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">III. Finalidades del Tratamiento</h2>
          <p><strong>Finalidades Primarias (necesarias):</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Creación y gestión de su cuenta.</li>
            <li>Procesamiento de depósitos en garantía.</li>
            <li>Validación de identidad para prevenir fraudes y lavado de dinero (cumplimiento LFPIORPI).</li>
            <li>Gestión de pujas y envío de artículos ganados.</li>
          </ul>
          <p><strong>Finalidades Secundarias:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Envío de boletines, ofertas y encuestas de calidad (puede oponerse a estas en cualquier momento).</li>
          </ul>

          <h2 className="font-semibold text-stone-800 text-base mt-4">IV. Transferencia de Datos</h2>
          <p>
            Sus datos financieros y de identidad podrán ser transferidos a <strong>Stripe Payments México S. de R.L. de C.V.</strong> exclusivamente para el procesamiento de pagos y validación de depósitos en garantía. También podrán transferirse a autoridades competentes cuando exista un requerimiento legal, y a proveedores de logística para la entrega de productos.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">V. Derechos ARCO y Revocación</h2>
          <p>
            Usted tiene derecho a <strong>Acceder, Rectificar, Cancelar u Oponerse</strong> (Derechos ARCO) al tratamiento de sus datos. Para ejercerlos, envíe un correo a{' '}
            <a href="mailto:privacidad@subastasgeek.com" className="underline hover:text-stone-900">privacidad@subastasgeek.com</a>{' '}
            indicando su petición, la cual será respondida en un plazo máximo de 20 días hábiles.
          </p>

          <h2 className="font-semibold text-stone-800 text-base mt-4">VI. Cambios al Aviso de Privacidad</h2>
          <p>
            Cualquier modificación será notificada a través de nuestra plataforma o vía correo electrónico. Le recomendamos revisar periódicamente esta página.
          </p>

        </div>
      </div>
    </div>
  )
}
